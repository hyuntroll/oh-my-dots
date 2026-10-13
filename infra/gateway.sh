#!/bin/sh
set -eu
envsubst '${DOT_SESSION_TOKEN} ${DOT_API_PORT} ${DOT_WEB_PORT} ${DOT_SHELL_SUBNET}' < /etc/ohmydot/nginx.conf.template > /etc/nginx/nginx.conf
exec nginx -g 'daemon off;'
