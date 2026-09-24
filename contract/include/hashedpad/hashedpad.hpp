#pragma once

#include <eosio/action.hpp>
#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/singleton.hpp>
#include <eosio/system.hpp>
#include <cstdint>
#include <string>

using namespace eosio;
using std::string;

class [[eosio::contract("hashedpad")]] hashedpad : public contract {
public:
    using contract::contract;

    static constexpr uint8_t STATUS_DRAFT = 0;
    static constexpr uint8_t STATUS_ACTIVE = 1;
    static constexpr uint8_t STATUS_SUCCESS = 2;
    static constexpr uint8_t STATUS_FAILED = 3;
    static constexpr uint8_t STATUS_CANCELLED = 4;

    [[eosio::action]]
    void setconfig(name fee_receiver, uint16_t fee_bps);

    [[eosio::action]]
    void createcamp(name creator,
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
                    bool allowlist_enabled);

    [[eosio::action]]
    void setallow(uint64_t campaign_id, name account, bool allowed);

    [[eosio::action]]
    void activate(uint64_t campaign_id);

    [[eosio::action]]
    void cancel(uint64_t campaign_id);

    [[eosio::action]]
    void finalize(uint64_t campaign_id);

    [[eosio::action]]
    void claim(uint64_t campaign_id, name participant);

    [[eosio::action]]
    void refund(uint64_t campaign_id, name participant);

    [[eosio::action]]
    void withdraw(uint64_t campaign_id);

    [[eosio::action]]
    void reclaim(uint64_t campaign_id);

    [[eosio::on_notify("*::transfer")]]
    void ontransfer(name from, name to, asset quantity, string memo);

    struct [[eosio::table("campaigns")]] campaign {
        uint64_t id;
        name creator;

        name sale_contract;
        asset token_allocation;
        asset deposited;
        asset sold;

        name payment_contract;
        symbol payment_symbol;
        asset tokens_per_payment;
        asset raised;

        uint32_t start_at;
        uint32_t end_at;

        asset soft_cap;
        asset hard_cap;
        asset min_contribution;
        asset max_contribution;

        bool allowlist_enabled;
        uint8_t status;

        name fee_receiver;
        uint16_t fee_bps;

        bool proceeds_withdrawn;
        bool sale_reclaimed;

        uint64_t primary_key() const { return id; }
        uint64_t by_creator() const { return creator.value; }
    };

    struct [[eosio::table("contribs")]] contribution {
        name account;
        asset paid;
        asset claimable;
        bool claimed;
        bool refunded;

        uint64_t primary_key() const { return account.value; }
    };

    struct [[eosio::table("allowlist")]] allow_entry {
        name account;
        uint64_t primary_key() const { return account.value; }
    };

    struct [[eosio::table("state")]] state_row {
        uint64_t next_campaign_id = 1;
    };

    struct [[eosio::table("config")]] config_row {
        name fee_receiver;
        uint16_t fee_bps = 0;
    };

    using campaigns = eosio::multi_index<
        "campaigns"_n,
        campaign,
        indexed_by<"bycreator"_n, const_mem_fun<campaign, uint64_t, &campaign::by_creator>>
    >;
    using contributions = eosio::multi_index<"contribs"_n, contribution>;
    using allowlist = eosio::multi_index<"allowlist"_n, allow_entry>;
    using state_singleton = eosio::singleton<"state"_n, state_row>;
    using config_singleton = eosio::singleton<"config"_n, config_row>;

private:
    static uint64_t parse_campaign_id(const string& memo, const string& prefix);
    static int64_t pow10(uint8_t precision);
    static asset calculate_sale_amount(const asset& payment, const asset& rate, uint8_t payment_precision);

    void handle_deposit(name token_contract,
                        name from,
                        const asset& quantity,
                        const string& memo);

    void handle_purchase(name token_contract,
                         name from,
                         const asset& quantity,
                         const string& memo);

    void send_token(name token_contract,
                    name to,
                    const asset& quantity,
                    const string& memo);

    static uint32_t now_seconds();
};
