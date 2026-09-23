cmake_minimum_required(VERSION 3.5)
project(hashedlaunch)
set(EOSIO_WASM_OLD_BEHAVIOR "Off")
find_package(eosio.cdt)
include(EosioWasmToolchain)

add_contract(hashedlaunch hashedlaunch ${CMAKE_CURRENT_SOURCE_DIR}/src/hashedlaunch.cpp)
target_include_directories(hashedlaunch PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(hashedlaunch PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}")
