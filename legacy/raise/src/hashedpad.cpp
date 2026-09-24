#include <hashedpad/hashedpad.hpp>

#include <limits>
#include <tuple>

uint32_t hashedpad::now_seconds() {
    return time_point_sec(current_time_point()).sec_since_epoch();
}

int64_t hashedpad::ceil_div_128(__int128 numerator, int64_t denominator) {
    check(numerator > 0, "curve numerator must be positive");
    check(denominator > 0, "curve denominator must be positive");

    const __int128 result =
        (numerator + static_cast<__int128>(denominator) - 1) /
        static_cast<__int128>(denominator);

    check(result > 0, "curve result must be positive");
    check(result <= std::numeric_limits<int64_t>::max(), "curve arithmetic overflow");

    return static_cast<int64_t>(result);
}

uint64_t hashedpad::parse_launch_id(const string& memo, const string& prefix) {
    check(memo.rfind(prefix, 0) == 0, "invalid meme launch memo");
    check(memo.size() > prefix.size(), "launch id is missing from memo");

    uint64_t id = 0;

    for (size_t i = prefix.size(); i < memo.size(); ++i) {
        const char c = memo[i];
        check(c >= '0' && c <= '9', "launch id must contain digits only");

        const uint64_t digit = static_cast<uint64_t>(c - '0');
        check(
            id <= (std::numeric_limits<uint64_t>::max() - digit) / 10,
            "launch id overflow"
        );

        id = id * 10 + digit;
    }

    check(id > 0, "launch id must be greater than zero");
    return id;
}

void hashedpad::validate_metadata(const string& token_name,
                                  const string& image_uri,
                                  const string& description,
                                  const string& website,
                                  const string& x_url,
                                  const string& telegram_url) {
    check(!token_name.empty() && token_name.size() <= 64,
          "token name must be between 1 and 64 bytes");
    check(!image_uri.empty() && image_uri.size() <= 256,
          "image URI must be between 1 and 256 bytes");
    check(description.size() <= 512, "description is too long");
    check(website.size() <= 256, "website URL is too long");
    check(x_url.size() <= 256, "X URL is too long");
    check(telegram_url.size() <= 256, "Telegram URL is too long");
}

void hashedpad::setconfig(name launcher_contract,
                          name payment_contract,
                          symbol payment_symbol,
                          name fee_receiver,
                          uint16_t protocol_fee_bps,
                          uint16_t creator_fee_bps,
                          asset virtual_payment,
                          asset graduation_target) {
    require_auth(get_self());

    check(is_account(launcher_contract), "token launcher contract does not exist");
    check(is_account(payment_contract), "payment token contract does not exist");
    check(is_account(fee_receiver), "fee receiver account does not exist");
    check(payment_symbol.is_valid(), "invalid payment symbol");

    check(protocol_fee_bps <= 500, "protocol fee cannot exceed 5%");
    check(creator_fee_bps <= 500, "creator fee cannot exceed 5%");
    check(
        static_cast<uint32_t>(protocol_fee_bps) + static_cast<uint32_t>(creator_fee_bps) <= 500,
        "combined trading fee cannot exceed 5%"
    );

    check(virtual_payment.is_valid(), "invalid virtual payment reserve");
    check(virtual_payment.symbol == payment_symbol, "virtual reserve symbol mismatch");
    check(virtual_payment.amount > 0, "virtual payment reserve must be positive");

    check(graduation_target.is_valid(), "invalid graduation target");
    check(graduation_target.symbol == payment_symbol, "graduation target symbol mismatch");
    check(graduation_target.amount > 0, "graduation target must be positive");

    config_singleton config(get_self(), get_self().value);
    config.set(
        config_row{
            launcher_contract,
            payment_contract,
            payment_symbol,
            fee_receiver,
            protocol_fee_bps,
            creator_fee_bps,
            virtual_payment,
            graduation_target
        },
        get_self()
    );
}

void hashedpad::creatememe(name creator,
                           symbol sale_symbol,
                           string token_name,
                           string image_uri,
                           string description,
                           string website,
                           string x_url,
                           string telegram_url) {
    require_auth(creator);

    check(is_account(creator), "creator account does not exist");
    check(sale_symbol.is_valid(), "invalid sale token symbol");
    validate_metadata(
        token_name,
        image_uri,
        description,
        website,
        x_url,
        telegram_url
    );

    config_singleton config(get_self(), get_self().value);
    check(config.exists(), "meme launchpad is not configured");
    const auto cfg = config.get();

    launcher_stats statstable(
        cfg.launcher_contract,
        sale_symbol.code().raw()
    );

    auto token = statstable.find(sale_symbol.code().raw());
    check(token != statstable.end(), "token does not exist on the Hashed launcher");
    check(token->supply.symbol == sale_symbol, "sale token precision mismatch");
    check(token->issuer == creator, "only the token issuer may create its meme launch");
    check(token->mint_locked, "lock token minting before creating a meme launch");
    check(token->supply.amount > 0, "token supply must be positive");
    check(
        token->supply == token->max_supply,
        "issue the full maximum supply before creating a meme launch"
    );

    launches table(get_self(), get_self().value);
    auto by_symbol = table.get_index<"bysymbol"_n>();
    check(
        by_symbol.find(sale_symbol.code().raw()) == by_symbol.end(),
        "this token already has a meme launch"
    );

    state_singleton state(get_self(), get_self().value);
    auto st = state.get_or_default();
    check(st.next_launch_id > 0, "launch id overflow");

    const uint64_t launch_id = st.next_launch_id;
    const asset zero_payment{0, cfg.payment_symbol};

    table.emplace(creator, [&](auto& row) {
        row.id = launch_id;
        row.creator = creator;

        row.sale_contract = cfg.launcher_contract;
        row.sale_symbol = sale_symbol;
        row.token_allocation = token->supply;
        row.token_reserve = asset{0, sale_symbol};

        row.payment_contract = cfg.payment_contract;
        row.payment_symbol = cfg.payment_symbol;
        row.virtual_payment = cfg.virtual_payment;
        row.payment_reserve = zero_payment;
        row.graduation_target = cfg.graduation_target;

        row.fee_receiver = cfg.fee_receiver;
        row.protocol_fee_bps = cfg.protocol_fee_bps;
        row.creator_fee_bps = cfg.creator_fee_bps;

        row.graduated = false;
        row.status = STATUS_DRAFT;

        row.volume = zero_payment;
        row.trade_count = 0;
        row.created_at = now_seconds();

        row.token_name = token_name;
        row.image_uri = image_uri;
        row.description = description;
        row.website = website;
        row.x_url = x_url;
        row.telegram_url = telegram_url;
    });

    check(st.next_launch_id != std::numeric_limits<uint64_t>::max(), "launch id overflow");
    st.next_launch_id += 1;
    state.set(st, creator);
}

void hashedpad::cancel(uint64_t launch_id) {
    launches table(get_self(), get_self().value);
    auto launch_it = table.find(launch_id);
    check(launch_it != table.end(), "meme launch does not exist");

    require_auth(launch_it->creator);
    check(launch_it->status == STATUS_DRAFT, "only a draft launch can be cancelled");
    check(launch_it->token_reserve.amount == 0, "cannot cancel after token escrow");

    table.modify(launch_it, same_payer, [&](auto& row) {
        row.status = STATUS_CANCELLED;
    });
}

void hashedpad::send_token(name token_contract,
                           name to,
                           const asset& quantity,
                           const string& memo) {
    check(quantity.amount > 0, "outgoing token amount must be positive");

    action(
        permission_level{get_self(), "active"_n},
        token_contract,
        "transfer"_n,
        std::make_tuple(get_self(), to, quantity, memo)
    ).send();
}

void hashedpad::record_trade(uint64_t launch_id,
                             name trader,
                             bool is_buy,
                             const asset& payment,
                             const asset& tokens,
                             uint64_t trade_id) {
    trades trade_table(get_self(), launch_id);

    trade_table.emplace(get_self(), [&](auto& row) {
        row.id = trade_id;
        row.trader = trader;
        row.is_buy = is_buy;
        row.payment = payment;
        row.tokens = tokens;
        row.timestamp = now_seconds();
    });
}

void hashedpad::handle_deposit(name token_contract,
                               name from,
                               const asset& quantity,
                               const string& memo) {
    const uint64_t launch_id = parse_launch_id(memo, "deposit:");

    launches table(get_self(), get_self().value);
    auto launch_it = table.find(launch_id);
    check(launch_it != table.end(), "meme launch does not exist");

    check(launch_it->status == STATUS_DRAFT, "meme launch is not awaiting token escrow");
    check(from == launch_it->creator, "only the creator may escrow the meme supply");
    check(token_contract == launch_it->sale_contract, "wrong sale token contract");
    check(quantity.symbol == launch_it->sale_symbol, "wrong sale token symbol");
    check(
        quantity == launch_it->token_allocation,
        "deposit the entire fixed token supply to start the meme launch"
    );

    table.modify(launch_it, same_payer, [&](auto& row) {
        row.token_reserve = quantity;
        row.status = STATUS_LIVE;
    });
}

void hashedpad::handle_buy(name token_contract,
                           name buyer,
                           const asset& quantity,
                           const string& memo) {
    const uint64_t launch_id = parse_launch_id(memo, "buy:");

    launches table(get_self(), get_self().value);
    auto launch_it = table.find(launch_id);
    check(launch_it != table.end(), "meme launch does not exist");

    check(launch_it->status == STATUS_LIVE, "meme launch is not live");
    check(token_contract == launch_it->payment_contract, "wrong payment token contract");
    check(quantity.symbol == launch_it->payment_symbol, "wrong payment token symbol");
    check(quantity.amount > 0, "buy amount must be positive");
    check(launch_it->token_reserve.amount > 1, "bonding curve has no tokens left");

    const int64_t protocol_fee =
        static_cast<int64_t>(
            static_cast<__int128>(quantity.amount) * launch_it->protocol_fee_bps / 10000
        );

    const int64_t creator_fee =
        static_cast<int64_t>(
            static_cast<__int128>(quantity.amount) * launch_it->creator_fee_bps / 10000
        );

    const int64_t net_input = quantity.amount - protocol_fee - creator_fee;
    check(net_input > 0, "buy amount is too small after fees");

    const int64_t current_x =
        launch_it->virtual_payment.amount + launch_it->payment_reserve.amount;

    check(
        current_x <= std::numeric_limits<int64_t>::max() - net_input,
        "payment reserve overflow"
    );

    const int64_t new_x = current_x + net_input;

    const __int128 invariant =
        static_cast<__int128>(launch_it->virtual_payment.amount) *
        static_cast<__int128>(launch_it->token_allocation.amount);

    const int64_t new_y = ceil_div_128(invariant, new_x);

    check(new_y < launch_it->token_reserve.amount, "buy amount is too small for one token unit");

    const int64_t token_output_amount =
        launch_it->token_reserve.amount - new_y;

    const asset token_output{token_output_amount, launch_it->sale_symbol};
    const asset net_payment{net_input, launch_it->payment_symbol};

    const uint64_t trade_id = launch_it->trade_count;

    table.modify(launch_it, same_payer, [&](auto& row) {
        row.token_reserve.amount = new_y;
        row.payment_reserve += net_payment;
        row.volume += quantity;
        row.trade_count += 1;

        if (!row.graduated &&
            row.payment_reserve.amount >= row.graduation_target.amount) {
            row.graduated = true;
        }
    });

    record_trade(
        launch_id,
        buyer,
        true,
        quantity,
        token_output,
        trade_id
    );

    if (protocol_fee > 0) {
        send_token(
            launch_it->payment_contract,
            launch_it->fee_receiver,
            asset{protocol_fee, launch_it->payment_symbol},
            string("Hashed meme protocol fee #") + std::to_string(launch_id)
        );
    }

    if (creator_fee > 0) {
        send_token(
            launch_it->payment_contract,
            launch_it->creator,
            asset{creator_fee, launch_it->payment_symbol},
            string("Hashed meme creator fee #") + std::to_string(launch_id)
        );
    }

    send_token(
        launch_it->sale_contract,
        buyer,
        token_output,
        string("Hashed meme buy #") + std::to_string(launch_id)
    );
}

void hashedpad::handle_sell(name token_contract,
                            name seller,
                            const asset& quantity,
                            const string& memo) {
    const uint64_t launch_id = parse_launch_id(memo, "sell:");

    launches table(get_self(), get_self().value);
    auto launch_it = table.find(launch_id);
    check(launch_it != table.end(), "meme launch does not exist");

    check(launch_it->status == STATUS_LIVE, "meme launch is not live");
    check(token_contract == launch_it->sale_contract, "wrong sale token contract");
    check(quantity.symbol == launch_it->sale_symbol, "wrong sale token symbol");
    check(quantity.amount > 0, "sell amount must be positive");

    check(
        quantity.amount <= launch_it->token_allocation.amount - launch_it->token_reserve.amount,
        "cannot sell more tokens than the bonding curve has released"
    );

    check(
        launch_it->token_reserve.amount <=
            launch_it->token_allocation.amount - quantity.amount,
        "sell would exceed the original fixed token supply"
    );

    const int64_t new_y = launch_it->token_reserve.amount + quantity.amount;

    const __int128 invariant =
        static_cast<__int128>(launch_it->virtual_payment.amount) *
        static_cast<__int128>(launch_it->token_allocation.amount);

    const int64_t new_x = ceil_div_128(invariant, new_y);

    const int64_t current_x =
        launch_it->virtual_payment.amount + launch_it->payment_reserve.amount;

    check(new_x < current_x, "sell amount is too small for payment output");

    const int64_t gross_output = current_x - new_x;
    check(gross_output > 0, "sell output must be positive");
    check(
        gross_output <= launch_it->payment_reserve.amount,
        "bonding curve payment reserve is insufficient"
    );

    const int64_t protocol_fee =
        static_cast<int64_t>(
            static_cast<__int128>(gross_output) * launch_it->protocol_fee_bps / 10000
        );

    const int64_t creator_fee =
        static_cast<int64_t>(
            static_cast<__int128>(gross_output) * launch_it->creator_fee_bps / 10000
        );

    const int64_t net_output = gross_output - protocol_fee - creator_fee;
    check(net_output > 0, "sell output is too small after fees");

    const asset gross_payment{gross_output, launch_it->payment_symbol};
    const asset net_payment{net_output, launch_it->payment_symbol};
    const uint64_t trade_id = launch_it->trade_count;

    table.modify(launch_it, same_payer, [&](auto& row) {
        row.token_reserve += quantity;
        row.payment_reserve -= gross_payment;
        row.volume += gross_payment;
        row.trade_count += 1;
    });

    record_trade(
        launch_id,
        seller,
        false,
        gross_payment,
        quantity,
        trade_id
    );

    send_token(
        launch_it->payment_contract,
        seller,
        net_payment,
        string("Hashed meme sell #") + std::to_string(launch_id)
    );

    if (protocol_fee > 0) {
        send_token(
            launch_it->payment_contract,
            launch_it->fee_receiver,
            asset{protocol_fee, launch_it->payment_symbol},
            string("Hashed meme protocol fee #") + std::to_string(launch_id)
        );
    }

    if (creator_fee > 0) {
        send_token(
            launch_it->payment_contract,
            launch_it->creator,
            asset{creator_fee, launch_it->payment_symbol},
            string("Hashed meme creator fee #") + std::to_string(launch_id)
        );
    }
}

void hashedpad::ontransfer(name from, name to, asset quantity, string memo) {
    if (to != get_self() || from == get_self()) {
        return;
    }

    check(quantity.is_valid(), "invalid transferred asset");
    check(quantity.amount > 0, "transferred amount must be positive");
    check(memo.size() <= 256, "memo has more than 256 bytes");

    const name token_contract = get_first_receiver();

    if (memo.rfind("deposit:", 0) == 0) {
        handle_deposit(token_contract, from, quantity, memo);
        return;
    }

    if (memo.rfind("buy:", 0) == 0) {
        handle_buy(token_contract, from, quantity, memo);
        return;
    }

    if (memo.rfind("sell:", 0) == 0) {
        handle_sell(token_contract, from, quantity, memo);
        return;
    }

    check(
        false,
        "meme launch transfer memo must be deposit:<id>, buy:<id>, or sell:<id>"
    );
}