cmake_minimum_required(VERSION 3.5)
project(hashed)
set(EOSIO_WASM_OLD_BEHAVIOR "Off")
find_package(eosio.cdt)
include(EosioWasmToolchain)

add_contract(hashedlaunch hashedlaunch ${CMAKE_CURRENT_SOURCE_DIR}/src/hashedlaunch.cpp)
target_include_directories(hashedlaunch PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(hashedlaunch PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}")

add_contract(hashedpad hashedpad ${CMAKE_CURRENT_SOURCE_DIR}/src/hashedpad.cpp)
target_include_directories(hashedpad PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(hashedpad PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}")
