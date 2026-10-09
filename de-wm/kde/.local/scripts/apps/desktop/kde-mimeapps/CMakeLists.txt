cmake_minimum_required(VERSION 3.22)
project(kde_mimeapps_export LANGUAGES CXX)

find_package(Qt6 REQUIRED COMPONENTS Core)
find_package(KF6Config 6.23 REQUIRED)
find_package(KF6Service REQUIRED)

add_executable(kde-mimeapps-export main.cpp)
target_compile_features(kde-mimeapps-export PRIVATE cxx_std_17)
target_compile_options(kde-mimeapps-export PRIVATE -Wall -Wextra -Wpedantic)
target_link_libraries(kde-mimeapps-export PRIVATE Qt6::Core KF6::ConfigCore KF6::Service)
