#!/bin/sh

add-apt-repository ppa:kurento/kurento
apt-get update
apt-get install -y kurento-media-server
