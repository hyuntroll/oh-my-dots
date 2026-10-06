#!/bin/sh
set -eu
envsubst '${DOT_SESSION_TOKEN}' < /etc/ohmydot/nginx.conf.template > /etc/nginx/nginx.conf
exec nginx -g 'daemon off;'
