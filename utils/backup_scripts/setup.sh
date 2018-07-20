#!/bin/bash

# Sets up portable redis binaries

fileExists () {
    [[ ! -f $1 ]]
}

if fileExists redis-*.tar.gz; then
    echo "no redis-*.tar.gz files exist so downloading latest one"
    wget http://download.redis.io/releases/redis-stable.tar.gz
    tar xzf redis-stable.tar.gz
    cd redis-stable
    make
fi
