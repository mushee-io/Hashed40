#include <hashedlaunch/hashedlaunch.hpp>

void hashedlaunch::create_token(name issuer,
                                const asset& maximum_supply,
                                const string& token_name,
                                const string& metadata_uri) {
    check(eosio::is_account(issuer), "issuer account does not exist");
    check(maximum_supply.is_valid(), "invalid maximum supply");
    check(maximum_supply.amount > 0, "maximum supply must be positive");
    check(maximum_supply.symbol.is_valid(), "invalid token symbol");
    check(token_name.size() > 0 && token_name.size() <= 64,
          "token name must be between 1 and 64 characters");
    check(metadata_uri.size() <= 256, "metadata URI is too long");

    const auto sym = maximum_supply.symbol;
    stats statstable(get_self(), sym.code().raw());
    auto existing = statstable.find(sym.code().raw());
    check(existing == statstable.end(), "token symbol already exists on this launcher");

    // Creator pays RAM for token state. This prevents arbitrary users from draining
    // the launcher's RAM simply by creating tokens.
    statstable.emplace(issuer, [&](auto& s) {
        s.supply = asset{0, sym};
        s.max_supply = maximum_supply;
        s.issuer = issuer;
    });

    metadata metatable(get_self(), get_self().value);
    auto meta_existing = metatable.find(sym.code().raw());
    check(meta_existing == metatable.end(), "metadata already exists for symbol");
    metatable.emplace(issuer, [&](auto& m) {
        m.symcode = sym.code();
        m.creator = issuer;
        m.token_name = token_name;
        m.metadata_uri = metadata_uri;
    });
}

void hashedlaunch::create(name issuer,
                          asset maximum_supply,
                          string token_name,
                          string metadata_uri) {
    require_auth(issuer);
    create_token(issuer, maximum_supply, token_name, metadata_uri);
}

void hashedlaunch::launch(name issuer,
                          asset maximum_supply,
                          asset initial_supply,
                          string token_name,
                          string metadata_uri) {
    require_auth(issuer);
    check(initial_supply.is_valid(), "invalid initial supply");
    check(initial_supply.amount >= 0, "initial supply cannot be negative");
    check(initial_supply.symbol == maximum_supply.symbol,
          "initial and maximum supply symbols/precision must match");
    check(initial_supply.amount <= maximum_supply.amount,
          "initial supply cannot exceed maximum supply");

    create_token(issuer, maximum_supply, token_name, metadata_uri);

    if (initial_supply.amount > 0) {
        issue_internal(issuer, initial_supply);
    }
}

void hashedlaunch::issue_internal(name to, const asset& quantity) {
    const auto sym = quantity.symbol;
    stats statstable(get_self(), sym.code().raw());
    auto existing = statstable.find(sym.code().raw());
    check(existing != statstable.end(), "token does not exist");
    const auto& st = *existing;

    check(to == st.issuer, "new supply can only be issued to the issuer");
    check(quantity.is_valid(), "invalid quantity");
    check(quantity.amount > 0, "must issue a positive quantity");
    check(quantity.symbol == st.supply.symbol, "symbol precision mismatch");
    check(quantity.amount <= st.max_supply.amount - st.supply.amount,
          "quantity exceeds available supply");

    statstable.modify(st, same_payer, [&](auto& s) { s.supply += quantity; });
    add_balance(st.issuer, quantity, st.issuer);
}

void hashedlaunch::issue(name to, asset quantity, string memo) {
    check(memo.size() <= 256, "memo has more than 256 bytes");

    stats statstable(get_self(), quantity.symbol.code().raw());
    auto existing = statstable.find(quantity.symbol.code().raw());
    check(existing != statstable.end(), "token does not exist");
    require_auth(existing->issuer);

    issue_internal(to, quantity);
}

void hashedlaunch::retire(asset quantity, string memo) {
    check(quantity.is_valid(), "invalid quantity");
    check(quantity.amount > 0, "must retire a positive quantity");
    check(memo.size() <= 256, "memo has more than 256 bytes");

    stats statstable(get_self(), quantity.symbol.code().raw());
    auto existing = statstable.find(quantity.symbol.code().raw());
    check(existing != statstable.end(), "token does not exist");
    const auto& st = *existing;

    require_auth(st.issuer);
    check(quantity.symbol == st.supply.symbol, "symbol precision mismatch");

    statstable.modify(st, same_payer, [&](auto& s) { s.supply -= quantity; });
    sub_balance(st.issuer, quantity);
}

void hashedlaunch::transfer(name from, name to, asset quantity, string memo) {
    check(from != to, "cannot transfer to self");
    require_auth(from);
    check(eosio::is_account(to), "recipient account does not exist");
    check(quantity.is_valid(), "invalid quantity");
    check(quantity.amount > 0, "must transfer a positive quantity");
    check(memo.size() <= 256, "memo has more than 256 bytes");

    stats statstable(get_self(), quantity.symbol.code().raw());
    const auto& st = statstable.get(quantity.symbol.code().raw(), "token does not exist");
    check(quantity.symbol == st.supply.symbol, "symbol precision mismatch");

    eosio::require_recipient(from);
    eosio::require_recipient(to);

    sub_balance(from, quantity);
    // Sender pays RAM if the receiver does not already have a balance row.
    add_balance(to, quantity, from);
}

void hashedlaunch::sub_balance(name owner, const asset& value) {
    accounts from_acnts(get_self(), owner.value);
    const auto& from = from_acnts.get(value.symbol.code().raw(), "no balance object found");
    check(from.balance.amount >= value.amount, "overdrawn balance");

    if (from.balance.amount == value.amount) {
        from_acnts.erase(from);
    } else {
        from_acnts.modify(from, owner, [&](auto& a) { a.balance -= value; });
    }
}

void hashedlaunch::add_balance(name owner, const asset& value, name ram_payer) {
    accounts to_acnts(get_self(), owner.value);
    auto to = to_acnts.find(value.symbol.code().raw());
    if (to == to_acnts.end()) {
        to_acnts.emplace(ram_payer, [&](auto& a) { a.balance = value; });
    } else {
        to_acnts.modify(to, same_payer, [&](auto& a) { a.balance += value; });
    }
}

void hashedlaunch::open(name owner, const symbol& sym, name ram_payer) {
    require_auth(ram_payer);
    check(eosio::is_account(owner), "owner account does not exist");

    stats statstable(get_self(), sym.code().raw());
    const auto& st = statstable.get(sym.code().raw(), "token does not exist");
    check(st.supply.symbol == sym, "symbol precision mismatch");

    accounts acnts(get_self(), owner.value);
    auto it = acnts.find(sym.code().raw());
    if (it == acnts.end()) {
        acnts.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, sym}; });
    }
}

void hashedlaunch::close(name owner, const symbol& sym) {
    require_auth(owner);
    accounts acnts(get_self(), owner.value);
    auto it = acnts.find(sym.code().raw());
    check(it != acnts.end(), "balance row already closed or never opened");
    check(it->balance.amount == 0, "cannot close because balance is not zero");
    acnts.erase(it);
}

void hashedlaunch::setmeta(name issuer,
                           symbol_code symcode,
                           string token_name,
                           string metadata_uri) {
    require_auth(issuer);
    check(token_name.size() > 0 && token_name.size() <= 64,
          "token name must be between 1 and 64 characters");
    check(metadata_uri.size() <= 256, "metadata URI is too long");

    stats statstable(get_self(), symcode.raw());
    auto existing = statstable.find(symcode.raw());
    check(existing != statstable.end(), "token does not exist");
    check(existing->issuer == issuer, "only token issuer may update metadata");

    metadata metatable(get_self(), get_self().value);
    auto meta = metatable.find(symcode.raw());
    check(meta != metatable.end(), "metadata does not exist");
    metatable.modify(meta, same_payer, [&](auto& m) {
        m.token_name = token_name;
        m.metadata_uri = metadata_uri;
    });
}
