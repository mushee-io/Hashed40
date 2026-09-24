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
    static constexpr uint8_t STATUS_CANCELLED = 2;

    [[eosio::action]]
    void setconfig(name launcher_contract,
                   name payment_contract,
                   symbol payment_symbol,
                   name fee_receiver,
                   uint16_t protocol_fee_bps,
                   uint16_t creator_fee_bps,
                   asset virtual_payment,
                   asset graduation_target);

    [[eosio::action]]
    void creatememe(name creator,
                    symbol sale_symbol,
                    string token_name,
                    string image_uri,
                    string description,
                    string website,
                    string x_url,
                    string telegram_url);

    [[eosio::action]]
    void cancel(uint64_t launch_id);

    [[eosio::on_notify("*::transfer")]]
    void ontransfer(name from, name to, asset quantity, string memo);

    struct [[eosio::table("launches")]] launch {
        uint64_t id;
        name creator;

        name sale_contract;
        symbol sale_symbol;
        asset token_allocation;
        asset token_reserve;

        name payment_contract;
        symbol payment_symbol;
        asset virtual_payment;
        asset payment_reserve;
        asset graduation_target;

        name fee_receiver;
        uint16_t protocol_fee_bps;
        uint16_t creator_fee_bps;

        bool graduated;
        uint8_t status;

        asset volume;
        uint64_t trade_count;
        uint32_t created_at;

        string token_name;
        string image_uri;
        string description;
        string website;
        string x_url;
        string telegram_url;

        uint64_t primary_key() const { return id; }
        uint64_t by_creator() const { return creator.value; }
        uint64_t by_symbol() const { return sale_symbol.code().raw(); }
    };

    struct [[eosio::table("trades")]] trade {
        uint64_t id;
        name trader;
        bool is_buy;
        asset payment;
        asset tokens;
        uint32_t timestamp;

        uint64_t primary_key() const { return id; }
        uint64_t by_trader() const { return trader.value; }
    };

    struct [[eosio::table("state")]] state_row {
        uint64_t next_launch_id = 1;
    };

    struct [[eosio::table("config")]] config_row {
        name launcher_contract;
        name payment_contract;
        symbol payment_symbol;
        name fee_receiver;
        uint16_t protocol_fee_bps = 0;
        uint16_t creator_fee_bps = 0;
        asset virtual_payment;
        asset graduation_target;
    };

    // Read-only mirror of Hashed Token Launcher's stat row.
    // Meme launches require max supply to be issued and minting to be locked.
    struct launcher_stat {
        asset supply;
        asset max_supply;
        name issuer;
        bool mint_locked;

        uint64_t primary_key() const { return supply.symbol.code().raw(); }
    };

    using launches = eosio::multi_index<
        "launches"_n,
        launch,
        indexed_by<"bycreator"_n, const_mem_fun<launch, uint64_t, &launch::by_creator>>,
        indexed_by<"bysymbol"_n, const_mem_fun<launch, uint64_t, &launch::by_symbol>>
    >;

    using trades = eosio::multi_index<
        "trades"_n,
        trade,
        indexed_by<"bytrader"_n, const_mem_fun<trade, uint64_t, &trade::by_trader>>
    >;

    using state_singleton = eosio::singleton<"state"_n, state_row>;
    using config_singleton = eosio::singleton<"config"_n, config_row>;
    using launcher_stats = eosio::multi_index<"stat"_n, launcher_stat>;

private:
    static uint64_t parse_launch_id(const string& memo, const string& prefix);
    static uint32_t now_seconds();
    static int64_t ceil_div_128(__int128 numerator, int64_t denominator);

    void handle_deposit(name token_contract,
                        name from,
                        const asset& quantity,
                        const string& memo);

    void handle_buy(name token_contract,
                    name buyer,
                    const asset& quantity,
                    const string& memo);

    void handle_sell(name token_contract,
                     name seller,
                     const asset& quantity,
                     const string& memo);

    void send_token(name token_contract,
                    name to,
                    const asset& quantity,
                    const string& memo);

    void record_trade(uint64_t launch_id,
                      name trader,
                      bool is_buy,
                      const asset& payment,
                      const asset& tokens,
                      uint64_t trade_id);

    static void validate_metadata(const string& token_name,
                                  const string& image_uri,
                                  const string& description,
                                  const string& website,
                                  const string& x_url,
                                  const string& telegram_url);
};
