#!/bin/sh
exec 2>&1
exec kurento-media-server >>/var/log/kurento-media-server.log
