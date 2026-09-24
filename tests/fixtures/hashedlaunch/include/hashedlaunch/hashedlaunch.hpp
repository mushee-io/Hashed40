#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <string>

using namespace eosio;
using std::string;

class [[eosio::contract("hashedlaunch")]] hashedlaunch : public contract {
public:
    using contract::contract;

    [[eosio::action]]
    void create(name issuer,
                asset maximum_supply,
                string token_name,
                string metadata_uri);

    [[eosio::action]]
    void launch(name issuer,
                asset maximum_supply,
                asset initial_supply,
                string token_name,
                string metadata_uri);

    [[eosio::action]]
    void issue(name to, asset quantity, string memo);

    [[eosio::action]]
    void lockmint(name issuer, symbol_code symcode);

    [[eosio::action]]
    void retire(asset quantity, string memo);

    [[eosio::action]]
    void transfer(name from, name to, asset quantity, string memo);

    [[eosio::action]]
    void open(name owner, const symbol& sym, name ram_payer);

    [[eosio::action]]
    void close(name owner, const symbol& sym);

    [[eosio::action]]
    void setmeta(name issuer,
                 symbol_code symcode,
                 string token_name,
                 string metadata_uri);

    struct [[eosio::table]] account {
        asset balance;
        uint64_t primary_key() const { return balance.symbol.code().raw(); }
    };

    struct [[eosio::table]] currency_stats {
        asset supply;
        asset max_supply;
        name issuer;
        bool mint_locked = false;

        uint64_t primary_key() const { return supply.symbol.code().raw(); }
    };

    struct [[eosio::table]] token_meta {
        symbol_code symcode;
        name creator;
        string token_name;
        string metadata_uri;

        uint64_t primary_key() const { return symcode.raw(); }
    };

    using accounts = eosio::multi_index<"accounts"_n, account>;
    using stats = eosio::multi_index<"stat"_n, currency_stats>;
    using metadata = eosio::multi_index<"tokenmeta"_n, token_meta>;

private:
    void create_token(name issuer,
                      const asset& maximum_supply,
                      const string& token_name,
                      const string& metadata_uri);

    void issue_internal(name to, const asset& quantity);
    void sub_balance(name owner, const asset& value);
    void add_balance(name owner, const asset& value, name ram_payer);
};