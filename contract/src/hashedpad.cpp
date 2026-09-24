#include <hashedpad/hashedpad.hpp>

#include <limits>
#include <tuple>

uint32_t hashedpad::now_seconds() {
    return time_point_sec(current_time_point()).sec_since_epoch();
}

int64_t hashedpad::pow10(uint8_t precision) {
    check(precision <= 18, "unsupported asset precision");

    int64_t value = 1;
    for (uint8_t i = 0; i < precision; ++i) {
        check(value <= std::numeric_limits<int64_t>::max() / 10, "precision overflow");
        value *= 10;
    }

    return value;
}

int64_t hashedpad::fee_amount(int64_t amount, uint16_t fee_bps) {
    check(amount >= 0, "fee source amount cannot be negative");
    const __int128 value =
        static_cast<__int128>(amount) * static_cast<__int128>(fee_bps) / 10000;
    check(value <= std::numeric_limits<int64_t>::max(), "fee overflow");
    return static_cast<int64_t>(value);
}

uint64_t hashedpad::parse_id(const string& memo, const string& prefix) {
    check(memo.rfind(prefix, 0) == 0, "invalid Hashed launchpad memo");
    check(memo.size() > prefix.size(), "market id is missing from memo");

    uint64_t id = 0;
    for (size_t i = prefix.size(); i < memo.size(); ++i) {
        const char c = memo[i];
        check(c >= '0' && c <= '9', "market id must contain digits only");

        const uint64_t digit = static_cast<uint64_t>(c - '0');
        check(
            id <= (std::numeric_limits<uint64_t>::max() - digit) / 10,
            "market id overflow"
        );
        id = id * 10 + digit;
    }

    check(id > 0, "market id must be greater than zero");
    return id;
}

asset hashedpad::curve_cost(const market& m, int64_t from_sold, int64_t to_sold) {
    check(from_sold >= 0, "curve start cannot be negative");
    check(to_sold >= from_sold, "curve end cannot be below curve start");
    check(to_sold <= m.token_allocation.amount, "curve end exceeds token allocation");

    if (to_sold == from_sold) {
        return asset{0, m.payment_symbol};
    }

    const int64_t token_scale = pow10(m.token_symbol.precision());
    const int64_t delta_tokens = to_sold - from_sold;
    const int64_t price_delta = m.end_price.amount - m.start_price.amount;

    // Integral of:
    //   p(q) = start_price + (end_price - start_price) * q / allocation
    // where q is sold token atomic units. The final division by token_scale
    // converts token atomic units into whole-token units.
    const __int128 term1_num =
        static_cast<__int128>(m.start_price.amount) *
        static_cast<__int128>(delta_tokens);

    const __int128 q2 =
        static_cast<__int128>(to_sold) * static_cast<__int128>(to_sold);
    const __int128 q1 =
        static_cast<__int128>(from_sold) * static_cast<__int128>(from_sold);

    const __int128 term2_num =
        static_cast<__int128>(price_delta) * (q2 - q1);

    const __int128 term1 =
        term1_num / static_cast<__int128>(token_scale);

    const __int128 term2_den =
        static_cast<__int128>(2) *
        static_cast<__int128>(m.token_allocation.amount) *
        static_cast<__int128>(token_scale);

    const __int128 term2 = term2_num / term2_den;
    const __int128 total = term1 + term2;

    check(total >= 0, "curve produced a negative cost");
    check(total <= std::numeric_limits<int64_t>::max(), "curve cost overflow");

    return asset{static_cast<int64_t>(total), m.payment_symbol};
}

asset hashedpad::current_price(const market& m) {
    const __int128 delta =
        static_cast<__int128>(m.end_price.amount - m.start_price.amount) *
        static_cast<__int128>(m.sold.amount) /
        static_cast<__int128>(m.token_allocation.amount);

    const __int128 price =
        static_cast<__int128>(m.start_price.amount) + delta;

    check(price >= 0, "curve price cannot be negative");
    check(price <= std::numeric_limits<int64_t>::max(), "curve price overflow");

    return asset{static_cast<int64_t>(price), m.payment_symbol};
}

int64_t hashedpad::tokens_for_budget(const market& m, int64_t budget_amount) {
    check(budget_amount > 0, "buy budget must be positive");

    int64_t low = 0;
    int64_t high = m.token_allocation.amount - m.sold.amount;

    while (low < high) {
        const int64_t mid = low + (high - low + 1) / 2;
        const asset cost = curve_cost(m, m.sold.amount, m.sold.amount + mid);

        if (cost.amount <= budget_amount) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return low;
}

void hashedpad::setconfig(name launcher_contract,
                          name payment_contract,
                          symbol payment_symbol,
                          name fee_receiver,
                          uint16_t fee_bps) {
    require_auth(get_self());

    check(is_account(launcher_contract), "token launcher contract does not exist");
    check(is_account(payment_contract), "payment token contract does not exist");
    check(payment_symbol.is_valid(), "invalid payment symbol");
    check(fee_bps <= 1000, "platform fee cannot exceed 10%");
    check(fee_bps == 0 || is_account(fee_receiver), "fee receiver account does not exist");

    config_singleton config(get_self(), get_self().value);
    config.set(
        config_row{
            launcher_contract,
            payment_contract,
            payment_symbol,
            fee_receiver,
            fee_bps
        },
        get_self()
    );
}

void hashedpad::createmarket(name creator,
                             symbol token_symbol,
                             asset token_allocation,
                             asset start_price,
                             asset end_price,
                             asset graduation_target,
                             string display_name,
                             string image_uri,
                             string description,
                             string website,
                             string x_url,
                             string telegram_url) {
    require_auth(creator);

    check(is_account(creator), "creator account does not exist");
    check(token_symbol.is_valid(), "invalid token symbol");
    check(token_allocation.is_valid(), "invalid token allocation");
    check(token_allocation.amount > 0, "token allocation must be positive");
    check(token_allocation.symbol == token_symbol, "token allocation symbol mismatch");

    config_singleton config(get_self(), get_self().value);
    check(config.exists(), "launchpad is not configured");
    const auto cfg = config.get();

    check(start_price.is_valid(), "invalid start price");
    check(end_price.is_valid(), "invalid end price");
    check(graduation_target.is_valid(), "invalid graduation target");
    check(start_price.symbol == cfg.payment_symbol, "start price payment symbol mismatch");
    check(end_price.symbol == cfg.payment_symbol, "end price payment symbol mismatch");
    check(graduation_target.symbol == cfg.payment_symbol, "graduation target payment symbol mismatch");
    check(start_price.amount > 0, "start price must be positive");
    check(end_price.amount > start_price.amount, "end price must be greater than start price");
    check(graduation_target.amount > 0, "graduation target must be positive");

    check(display_name.size() > 0 && display_name.size() <= 64,
          "display name must be between 1 and 64 bytes");
    check(image_uri.size() <= 256, "image URI is too long");
    check(description.size() <= 512, "description is too long");
    check(website.size() <= 256, "website URL is too long");
    check(x_url.size() <= 256, "X URL is too long");
    check(telegram_url.size() <= 256, "Telegram URL is too long");

    state_singleton state(get_self(), get_self().value);
    auto st = state.get_or_default();
    check(st.next_market_id > 0, "market id overflow");

    markets table(get_self(), get_self().value);
    const uint64_t market_id = st.next_market_id;

    table.emplace(creator, [&](auto& row) {
        row.id = market_id;
        row.creator = creator;

        row.token_contract = cfg.launcher_contract;
        row.token_symbol = token_symbol;
        row.token_allocation = token_allocation;
        row.deposited = asset{0, token_symbol};
        row.sold = asset{0, token_symbol};

        row.payment_contract = cfg.payment_contract;
        row.payment_symbol = cfg.payment_symbol;
        row.start_price = start_price;
        row.end_price = end_price;
        row.graduation_target = graduation_target;
        row.reserve = asset{0, cfg.payment_symbol};
        row.volume = asset{0, cfg.payment_symbol};

        row.fee_receiver = cfg.fee_receiver;
        row.fee_bps = cfg.fee_bps;

        row.display_name = display_name;
        row.image_uri = image_uri;
        row.description = description;
        row.website = website;
        row.x_url = x_url;
        row.telegram_url = telegram_url;

        row.status = STATUS_DRAFT;
        row.created_at = now_seconds();
        row.graduated_at = 0;
    });

    check(st.next_market_id != std::numeric_limits<uint64_t>::max(), "market id overflow");
    st.next_market_id += 1;
    state.set(st, creator);
}

void hashedpad::activate(uint64_t market_id) {
    markets table(get_self(), get_self().value);
    auto market_it = table.find(market_id);
    check(market_it != table.end(), "market does not exist");

    require_auth(market_it->creator);
    check(market_it->status == STATUS_DRAFT, "market is not in draft status");
    check(
        market_it->deposited == market_it->token_allocation,
        "full token allocation must be deposited before activation"
    );

    table.modify(market_it, same_payer, [&](auto& row) {
        row.status = STATUS_LIVE;
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

void hashedpad::handle_seed(name token_contract,
                            name from,
                            const asset& quantity,
                            const string& memo) {
    const uint64_t market_id = parse_id(memo, "seed:");

    markets table(get_self(), get_self().value);
    auto market_it = table.find(market_id);
    check(market_it != table.end(), "market does not exist");

    check(market_it->status == STATUS_DRAFT, "market is not accepting token deposits");
    check(from == market_it->creator, "only the market creator may seed sale tokens");
    check(token_contract == market_it->token_contract, "wrong token contract");
    check(quantity.symbol == market_it->token_symbol, "wrong token symbol");
    check(quantity.amount > 0, "seed amount must be positive");
    check(
        market_it->deposited.amount <= market_it->token_allocation.amount - quantity.amount,
        "seed exceeds market token allocation"
    );

    table.modify(market_it, same_payer, [&](auto& row) {
        row.deposited += quantity;
    });
}

void hashedpad::handle_buy(name token_contract,
                           name from,
                           const asset& quantity,
                           const string& memo) {
    const uint64_t market_id = parse_id(memo, "buy:");

    markets table(get_self(), get_self().value);
    auto market_it = table.find(market_id);
    check(market_it != table.end(), "market does not exist");

    check(market_it->status == STATUS_LIVE, "market is not live");
    check(token_contract == market_it->payment_contract, "wrong payment contract");
    check(quantity.symbol == market_it->payment_symbol, "wrong payment symbol");
    check(quantity.amount > 0, "buy amount must be positive");
    check(market_it->sold.amount < market_it->token_allocation.amount, "market token allocation is sold out");

    // Use a conservative net budget to select token output, then charge the
    // protocol fee only on the curve cost actually consumed. Any unused UOS is
    // returned to the buyer rather than becoming accidental creator proceeds.
    const int64_t max_fee = fee_amount(quantity.amount, market_it->fee_bps);
    const int64_t budget = quantity.amount - max_fee;
    check(budget > 0, "buy amount is too small after fee");

    const int64_t token_amount = tokens_for_budget(*market_it, budget);
    check(token_amount > 0, "buy amount is too small for the current curve price");

    const asset tokens_out{token_amount, market_it->token_symbol};
    const asset exact_cost =
        curve_cost(*market_it, market_it->sold.amount, market_it->sold.amount + token_amount);
    check(exact_cost.amount > 0, "buy amount is too small for the current curve price");

    const int64_t fee = fee_amount(exact_cost.amount, market_it->fee_bps);
    const int64_t used = exact_cost.amount + fee;
    check(used <= quantity.amount, "internal buy cost exceeds transferred amount");

    const int64_t refund = quantity.amount - used;

    table.modify(market_it, same_payer, [&](auto& row) {
        row.sold += tokens_out;
        row.reserve += exact_cost;
        row.volume.amount += used;

        if (
            row.reserve.amount >= row.graduation_target.amount ||
            row.sold.amount == row.token_allocation.amount
        ) {
            row.status = STATUS_GRADUATED;
            row.graduated_at = now_seconds();
        }
    });

    if (fee > 0) {
        check(is_account(market_it->fee_receiver), "fee receiver account does not exist");
        send_token(
            market_it->payment_contract,
            market_it->fee_receiver,
            asset{fee, market_it->payment_symbol},
            string("Hashed launch fee #") + std::to_string(market_id)
        );
    }

    if (refund > 0) {
        send_token(
            market_it->payment_contract,
            from,
            asset{refund, market_it->payment_symbol},
            string("Hashed unused buy amount #") + std::to_string(market_id)
        );
    }

    send_token(
        market_it->token_contract,
        from,
        tokens_out,
        string("Hashed meme launch buy #") + std::to_string(market_id)
    );
}

void hashedpad::handle_sell(name token_contract,
                            name from,
                            const asset& quantity,
                            const string& memo) {
    const uint64_t market_id = parse_id(memo, "sell:");

    markets table(get_self(), get_self().value);
    auto market_it = table.find(market_id);
    check(market_it != table.end(), "market does not exist");

    check(market_it->status == STATUS_LIVE, "market is not live");
    check(token_contract == market_it->token_contract, "wrong token contract");
    check(quantity.symbol == market_it->token_symbol, "wrong token symbol");
    check(quantity.amount > 0, "sell amount must be positive");
    check(quantity.amount <= market_it->sold.amount, "cannot sell more tokens than the curve has sold");

    const int64_t new_sold = market_it->sold.amount - quantity.amount;
    const asset gross_out = curve_cost(*market_it, new_sold, market_it->sold.amount);
    check(gross_out.amount > 0, "sell amount is too small for the current curve price");
    check(gross_out.amount <= market_it->reserve.amount, "market reserve cannot satisfy this sell");

    const int64_t fee = fee_amount(gross_out.amount, market_it->fee_bps);
    const int64_t payout = gross_out.amount - fee;
    check(payout > 0, "sell payout is too small after fee");

    table.modify(market_it, same_payer, [&](auto& row) {
        row.sold -= quantity;
        row.reserve -= gross_out;
        row.volume += gross_out;
    });

    if (fee > 0) {
        check(is_account(market_it->fee_receiver), "fee receiver account does not exist");
        send_token(
            market_it->payment_contract,
            market_it->fee_receiver,
            asset{fee, market_it->payment_symbol},
            string("Hashed sell fee #") + std::to_string(market_id)
        );
    }

    send_token(
        market_it->payment_contract,
        from,
        asset{payout, market_it->payment_symbol},
        string("Hashed meme launch sell #") + std::to_string(market_id)
    );
}

void hashedpad::settle(uint64_t market_id) {
    markets table(get_self(), get_self().value);
    auto market_it = table.find(market_id);
    check(market_it != table.end(), "market does not exist");

    require_auth(market_it->creator);
    check(market_it->status == STATUS_GRADUATED, "market has not graduated");

    const asset reserve = market_it->reserve;
    const asset unsold = market_it->token_allocation - market_it->sold;

    table.modify(market_it, same_payer, [&](auto& row) {
        row.reserve.amount = 0;
        row.status = STATUS_CLOSED;
    });

    if (reserve.amount > 0) {
        send_token(
            market_it->payment_contract,
            market_it->creator,
            reserve,
            string("Hashed graduated market proceeds #") + std::to_string(market_id)
        );
    }

    if (unsold.amount > 0) {
        send_token(
            market_it->token_contract,
            market_it->creator,
            unsold,
            string("Hashed graduated market unsold tokens #") + std::to_string(market_id)
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

    if (memo.rfind("seed:", 0) == 0) {
        handle_seed(token_contract, from, quantity, memo);
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

    check(false, "launchpad memo must be seed:<market_id>, buy:<market_id>, or sell:<market_id>");
}