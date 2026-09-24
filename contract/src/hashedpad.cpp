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

asset hashedpad::calculate_sale_amount(const asset& payment,
                                       const asset& rate,
                                       uint8_t payment_precision) {
    check(payment.amount > 0, "payment must be positive");
    check(rate.amount > 0, "token rate must be positive");

    const int64_t scale = pow10(payment_precision);
    const __int128 numerator =
        static_cast<__int128>(payment.amount) * static_cast<__int128>(rate.amount);
    const __int128 result = numerator / scale;

    check(result > 0, "contribution is too small for the configured token rate");
    check(result <= std::numeric_limits<int64_t>::max(), "sale amount overflow");

    return asset{static_cast<int64_t>(result), rate.symbol};
}

uint64_t hashedpad::parse_campaign_id(const string& memo, const string& prefix) {
    check(memo.rfind(prefix, 0) == 0, "invalid launchpad memo");
    check(memo.size() > prefix.size(), "campaign id is missing from memo");

    uint64_t id = 0;
    for (size_t i = prefix.size(); i < memo.size(); ++i) {
        const char c = memo[i];
        check(c >= '0' && c <= '9', "campaign id must contain digits only");

        const uint64_t digit = static_cast<uint64_t>(c - '0');
        check(
            id <= (std::numeric_limits<uint64_t>::max() - digit) / 10,
            "campaign id overflow"
        );
        id = id * 10 + digit;
    }

    check(id > 0, "campaign id must be greater than zero");
    return id;
}

void hashedpad::setconfig(name fee_receiver, uint16_t fee_bps) {
    require_auth(get_self());
    check(fee_bps <= 1000, "platform fee cannot exceed 10%");
    check(fee_bps == 0 || is_account(fee_receiver), "fee receiver account does not exist");

    config_singleton config(get_self(), get_self().value);
    config.set(config_row{fee_receiver, fee_bps}, get_self());
}

void hashedpad::createcamp(name creator,
                           name sale_contract,
                           asset token_allocation,
                           name payment_contract,
                           symbol payment_symbol,
                           asset tokens_per_payment,
                           uint32_t start_at,
                           uint32_t end_at,
                           asset soft_cap,
                           asset hard_cap,
                           asset min_contribution,
                           asset max_contribution,
                           bool allowlist_enabled) {
    require_auth(creator);

    check(is_account(creator), "creator account does not exist");
    check(is_account(sale_contract), "sale token contract does not exist");
    check(is_account(payment_contract), "payment token contract does not exist");

    check(token_allocation.is_valid(), "invalid token allocation");
    check(token_allocation.amount > 0, "token allocation must be positive");
    check(tokens_per_payment.is_valid(), "invalid token rate");
    check(tokens_per_payment.amount > 0, "tokens per payment must be positive");
    check(
        tokens_per_payment.symbol == token_allocation.symbol,
        "token rate must use the sale token symbol and precision"
    );

    check(payment_symbol.is_valid(), "invalid payment symbol");

    check(soft_cap.is_valid(), "invalid soft cap");
    check(hard_cap.is_valid(), "invalid hard cap");
    check(min_contribution.is_valid(), "invalid minimum contribution");
    check(max_contribution.is_valid(), "invalid maximum contribution");

    check(soft_cap.symbol == payment_symbol, "soft cap payment symbol mismatch");
    check(hard_cap.symbol == payment_symbol, "hard cap payment symbol mismatch");
    check(min_contribution.symbol == payment_symbol, "minimum contribution symbol mismatch");
    check(max_contribution.symbol == payment_symbol, "maximum contribution symbol mismatch");

    check(soft_cap.amount >= 0, "soft cap cannot be negative");
    check(hard_cap.amount > 0, "hard cap must be positive");
    check(soft_cap.amount <= hard_cap.amount, "soft cap cannot exceed hard cap");
    check(min_contribution.amount > 0, "minimum contribution must be positive");
    check(max_contribution.amount >= min_contribution.amount, "maximum contribution is below minimum");
    check(max_contribution.amount <= hard_cap.amount, "maximum contribution cannot exceed hard cap");

    check(end_at > now_seconds(), "campaign end time must be in the future");
    check(end_at > start_at, "campaign end time must be after start time");

    const asset tokens_at_hard_cap =
        calculate_sale_amount(hard_cap, tokens_per_payment, payment_symbol.precision());
    check(
        tokens_at_hard_cap.amount <= token_allocation.amount,
        "token allocation cannot satisfy the configured hard cap and rate"
    );

    state_singleton state(get_self(), get_self().value);
    auto st = state.get_or_default();
    check(st.next_campaign_id > 0, "campaign id overflow");

    config_singleton config(get_self(), get_self().value);
    const auto cfg = config.get_or_default();

    campaigns table(get_self(), get_self().value);
    const uint64_t campaign_id = st.next_campaign_id;

    table.emplace(creator, [&](auto& row) {
        row.id = campaign_id;
        row.creator = creator;

        row.sale_contract = sale_contract;
        row.token_allocation = token_allocation;
        row.deposited = asset{0, token_allocation.symbol};
        row.sold = asset{0, token_allocation.symbol};

        row.payment_contract = payment_contract;
        row.payment_symbol = payment_symbol;
        row.tokens_per_payment = tokens_per_payment;
        row.raised = asset{0, payment_symbol};

        row.start_at = start_at;
        row.end_at = end_at;

        row.soft_cap = soft_cap;
        row.hard_cap = hard_cap;
        row.min_contribution = min_contribution;
        row.max_contribution = max_contribution;

        row.allowlist_enabled = allowlist_enabled;
        row.status = STATUS_DRAFT;

        row.fee_receiver = cfg.fee_receiver;
        row.fee_bps = cfg.fee_bps;

        row.proceeds_withdrawn = false;
        row.sale_reclaimed = false;
    });

    check(st.next_campaign_id != std::numeric_limits<uint64_t>::max(), "campaign id overflow");
    st.next_campaign_id += 1;
    state.set(st, creator);
}

void hashedpad::setallow(uint64_t campaign_id, name account, bool allowed) {
    campaigns table(get_self(), get_self().value);
    const auto& campaign = table.get(campaign_id, "campaign does not exist");

    require_auth(campaign.creator);
    check(campaign.allowlist_enabled, "campaign does not use an allowlist");
    check(campaign.status == STATUS_DRAFT || campaign.status == STATUS_ACTIVE,
          "campaign allowlist is locked");
    check(is_account(account), "allowlist account does not exist");

    allowlist list(get_self(), campaign_id);
    auto existing = list.find(account.value);

    if (allowed) {
        if (existing == list.end()) {
            list.emplace(campaign.creator, [&](auto& row) {
                row.account = account;
            });
        }
    } else if (existing != list.end()) {
        list.erase(existing);
    }
}

void hashedpad::activate(uint64_t campaign_id) {
    campaigns table(get_self(), get_self().value);
    auto campaign = table.find(campaign_id);
    check(campaign != table.end(), "campaign does not exist");

    require_auth(campaign->creator);
    check(campaign->status == STATUS_DRAFT, "campaign is not in draft status");
    check(campaign->deposited == campaign->token_allocation,
          "full token allocation must be deposited before activation");
    check(campaign->end_at > now_seconds(), "campaign has already ended");

    table.modify(campaign, same_payer, [&](auto& row) {
        row.status = STATUS_ACTIVE;
    });
}

void hashedpad::cancel(uint64_t campaign_id) {
    campaigns table(get_self(), get_self().value);
    auto campaign = table.find(campaign_id);
    check(campaign != table.end(), "campaign does not exist");

    require_auth(campaign->creator);
    check(
        campaign->status == STATUS_DRAFT ||
        (campaign->status == STATUS_ACTIVE && campaign->raised.amount == 0),
        "campaign cannot be cancelled after receiving contributions"
    );

    table.modify(campaign, same_payer, [&](auto& row) {
        row.status = STATUS_CANCELLED;
    });
}

void hashedpad::finalize(uint64_t campaign_id) {
    campaigns table(get_self(), get_self().value);
    auto campaign = table.find(campaign_id);
    check(campaign != table.end(), "campaign does not exist");
    check(campaign->status == STATUS_ACTIVE, "campaign is not active");

    const bool ended = now_seconds() >= campaign->end_at;
    const bool hard_cap_reached = campaign->raised.amount >= campaign->hard_cap.amount;
    check(ended || hard_cap_reached, "campaign is still running");

    const bool successful = campaign->raised.amount >= campaign->soft_cap.amount;

    table.modify(campaign, same_payer, [&](auto& row) {
        row.status = successful ? STATUS_SUCCESS : STATUS_FAILED;
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

void hashedpad::claim(uint64_t campaign_id, name participant) {
    require_auth(participant);

    campaigns table(get_self(), get_self().value);
    const auto& campaign = table.get(campaign_id, "campaign does not exist");
    check(campaign.status == STATUS_SUCCESS, "campaign is not successful");

    contributions contribs(get_self(), campaign_id);
    auto contribution = contribs.find(participant.value);
    check(contribution != contribs.end(), "participant has no contribution");
    check(!contribution->claimed, "tokens have already been claimed");
    check(!contribution->refunded, "contribution was already refunded");
    check(contribution->claimable.amount > 0, "participant has nothing to claim");

    const asset amount = contribution->claimable;

    contribs.modify(contribution, same_payer, [&](auto& row) {
        row.claimed = true;
    });

    send_token(
        campaign.sale_contract,
        participant,
        amount,
        string("Hashed launchpad claim #") + std::to_string(campaign_id)
    );
}

void hashedpad::refund(uint64_t campaign_id, name participant) {
    require_auth(participant);

    campaigns table(get_self(), get_self().value);
    const auto& campaign = table.get(campaign_id, "campaign does not exist");
    check(
        campaign.status == STATUS_FAILED || campaign.status == STATUS_CANCELLED,
        "campaign is not refundable"
    );

    contributions contribs(get_self(), campaign_id);
    auto contribution = contribs.find(participant.value);
    check(contribution != contribs.end(), "participant has no contribution");
    check(!contribution->refunded, "contribution has already been refunded");
    check(!contribution->claimed, "tokens have already been claimed");
    check(contribution->paid.amount > 0, "participant has nothing to refund");

    const asset amount = contribution->paid;

    contribs.modify(contribution, same_payer, [&](auto& row) {
        row.refunded = true;
    });

    send_token(
        campaign.payment_contract,
        participant,
        amount,
        string("Hashed launchpad refund #") + std::to_string(campaign_id)
    );
}

void hashedpad::withdraw(uint64_t campaign_id) {
    campaigns table(get_self(), get_self().value);
    auto campaign = table.find(campaign_id);
    check(campaign != table.end(), "campaign does not exist");

    require_auth(campaign->creator);
    check(campaign->status == STATUS_SUCCESS, "campaign is not successful");
    check(!campaign->proceeds_withdrawn, "campaign proceeds were already withdrawn");
    check(campaign->raised.amount > 0, "campaign has no proceeds");

    const asset raised = campaign->raised;
    const uint16_t fee_bps = campaign->fee_bps;
    const name fee_receiver = campaign->fee_receiver;

    __int128 fee_calc =
        static_cast<__int128>(raised.amount) * static_cast<__int128>(fee_bps);
    const int64_t fee_amount = static_cast<int64_t>(fee_calc / 10000);
    const int64_t creator_amount = raised.amount - fee_amount;

    check(creator_amount >= 0, "invalid platform fee calculation");

    table.modify(campaign, same_payer, [&](auto& row) {
        row.proceeds_withdrawn = true;
    });

    if (fee_amount > 0) {
        check(is_account(fee_receiver), "campaign fee receiver no longer exists");
        send_token(
            campaign->payment_contract,
            fee_receiver,
            asset{fee_amount, raised.symbol},
            string("Hashed launchpad fee #") + std::to_string(campaign_id)
        );
    }

    if (creator_amount > 0) {
        send_token(
            campaign->payment_contract,
            campaign->creator,
            asset{creator_amount, raised.symbol},
            string("Hashed launchpad proceeds #") + std::to_string(campaign_id)
        );
    }
}

void hashedpad::reclaim(uint64_t campaign_id) {
    campaigns table(get_self(), get_self().value);
    auto campaign = table.find(campaign_id);
    check(campaign != table.end(), "campaign does not exist");

    require_auth(campaign->creator);
    check(
        campaign->status == STATUS_SUCCESS ||
        campaign->status == STATUS_FAILED ||
        campaign->status == STATUS_CANCELLED,
        "campaign is not finalized or cancelled"
    );
    check(!campaign->sale_reclaimed, "sale token balance was already reclaimed");

    asset amount{0, campaign->token_allocation.symbol};

    if (campaign->status == STATUS_SUCCESS) {
        amount = campaign->deposited - campaign->sold;
    } else {
        amount = campaign->deposited;
    }

    table.modify(campaign, same_payer, [&](auto& row) {
        row.sale_reclaimed = true;
    });

    if (amount.amount > 0) {
        send_token(
            campaign->sale_contract,
            campaign->creator,
            amount,
            string("Hashed launchpad reclaim #") + std::to_string(campaign_id)
        );
    }
}

void hashedpad::handle_deposit(name token_contract,
                               name from,
                               const asset& quantity,
                               const string& memo) {
    const uint64_t campaign_id = parse_campaign_id(memo, "deposit:");

    campaigns table(get_self(), get_self().value);
    auto campaign = table.find(campaign_id);
    check(campaign != table.end(), "campaign does not exist");

    check(campaign->status == STATUS_DRAFT, "campaign is not accepting token deposits");
    check(from == campaign->creator, "only the campaign creator may deposit sale tokens");
    check(token_contract == campaign->sale_contract, "wrong sale token contract");
    check(quantity.symbol == campaign->token_allocation.symbol, "wrong sale token symbol");
    check(quantity.amount > 0, "sale token deposit must be positive");
    check(
        campaign->deposited.amount <= campaign->token_allocation.amount - quantity.amount,
        "deposit exceeds campaign token allocation"
    );

    table.modify(campaign, same_payer, [&](auto& row) {
        row.deposited += quantity;
    });
}

void hashedpad::handle_purchase(name token_contract,
                                name from,
                                const asset& quantity,
                                const string& memo) {
    const uint64_t campaign_id = parse_campaign_id(memo, "buy:");

    campaigns table(get_self(), get_self().value);
    auto campaign = table.find(campaign_id);
    check(campaign != table.end(), "campaign does not exist");

    check(campaign->status == STATUS_ACTIVE, "campaign is not active");
    check(token_contract == campaign->payment_contract, "wrong payment token contract");
    check(quantity.symbol == campaign->payment_symbol, "wrong payment token symbol");
    check(quantity.amount > 0, "contribution must be positive");

    const uint32_t now = now_seconds();
    check(now >= campaign->start_at, "campaign has not started");
    check(now < campaign->end_at, "campaign has ended");

    if (campaign->allowlist_enabled) {
        allowlist list(get_self(), campaign_id);
        check(list.find(from.value) != list.end(), "account is not allowlisted");
    }

    contributions contribs(get_self(), campaign_id);
    auto contribution = contribs.find(from.value);
    const int64_t prior_paid =
        contribution == contribs.end() ? 0 : contribution->paid.amount;

    check(
        prior_paid <= campaign->max_contribution.amount - quantity.amount,
        "participant maximum contribution exceeded"
    );

    if (prior_paid == 0) {
        check(
            quantity.amount >= campaign->min_contribution.amount,
            "contribution is below campaign minimum"
        );
    }

    check(
        campaign->raised.amount <= campaign->hard_cap.amount - quantity.amount,
        "campaign hard cap exceeded"
    );

    const asset sale_amount =
        calculate_sale_amount(quantity, campaign->tokens_per_payment, campaign->payment_symbol.precision());

    check(
        campaign->sold.amount <= campaign->token_allocation.amount - sale_amount.amount,
        "campaign sale allocation exceeded"
    );

    if (contribution == contribs.end()) {
        // Notification handlers cannot bill the transfer sender for RAM on
        // Antelope/Ultra. The launchpad sponsors the participant row instead.
        contribs.emplace(get_self(), [&](auto& row) {
            row.account = from;
            row.paid = quantity;
            row.claimable = sale_amount;
            row.claimed = false;
            row.refunded = false;
        });
    } else {
        check(!contribution->claimed && !contribution->refunded,
              "participant contribution is already settled");

        contribs.modify(contribution, same_payer, [&](auto& row) {
            row.paid += quantity;
            row.claimable += sale_amount;
        });
    }

    table.modify(campaign, same_payer, [&](auto& row) {
        row.raised += quantity;
        row.sold += sale_amount;
    });
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
        handle_purchase(token_contract, from, quantity, memo);
        return;
    }

    check(false, "launchpad transfer memo must be deposit:<campaign_id> or buy:<campaign_id>");
}