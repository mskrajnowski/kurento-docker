#!/bin/sh

docker run -t -i -p 8888:8888 \
       mskrajnowski/kurento:latest /sbin/my_init -- \
       bash -l
