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
    static constexpr uint8_t STATUS_LIVE = 1;
    static constexpr uint8_t STATUS_GRADUATED = 2;

    [[eosio::action]]
    void setconfig(name launcher_contract,
                   name payment_contract,
                   symbol payment_symbol,
                   name fee_receiver,
                   uint16_t fee_bps);

    [[eosio::action]]
    void createmarket(name creator,
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
                      string telegram_url);

    [[eosio::action]]
    void activate(uint64_t market_id);

    [[eosio::on_notify("*::transfer")]]
    void ontransfer(name from, name to, asset quantity, string memo);

    struct [[eosio::table("markets")]] market {
        uint64_t id;
        name creator;

        name token_contract;
        symbol token_symbol;
        asset token_allocation;
        asset deposited;
        asset sold;

        name payment_contract;
        symbol payment_symbol;
        asset start_price;
        asset end_price;
        asset graduation_target;
        asset reserve;
        asset volume;

        name fee_receiver;
        uint16_t fee_bps;

        string display_name;
        string image_uri;
        string description;
        string website;
        string x_url;
        string telegram_url;

        uint8_t status;
        uint32_t created_at;
        uint32_t graduated_at;

        uint64_t primary_key() const { return id; }
        uint64_t by_creator() const { return creator.value; }
    };

    struct [[eosio::table("state")]] state_row {
        uint64_t next_market_id = 1;
    };

    struct [[eosio::table("config")]] config_row {
        name launcher_contract;
        name payment_contract;
        symbol payment_symbol;
        name fee_receiver;
        uint16_t fee_bps = 0;
    };

    using markets = eosio::multi_index<
        "markets"_n,
        market,
        indexed_by<"bycreator"_n, const_mem_fun<market, uint64_t, &market::by_creator>>
    >;
    using state_singleton = eosio::singleton<"state"_n, state_row>;
    using config_singleton = eosio::singleton<"config"_n, config_row>;

private:
    static uint64_t parse_id(const string& memo, const string& prefix);
    static int64_t pow10(uint8_t precision);
    static uint32_t now_seconds();

    static asset curve_cost(const market& m, int64_t from_sold, int64_t to_sold);
    static int64_t tokens_for_budget(const market& m, int64_t budget_amount);
    static int64_t fee_amount(int64_t amount, uint16_t fee_bps);

    void handle_seed(name token_contract,
                     name from,
                     const asset& quantity,
                     const string& memo);

    void handle_buy(name token_contract,
                    name from,
                    const asset& quantity,
                    const string& memo);

    void handle_sell(name token_contract,
                     name from,
                     const asset& quantity,
                     const string& memo);

    void send_token(name token_contract,
                    name to,
                    const asset& quantity,
                    const string& memo);
};
