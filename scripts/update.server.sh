#!/bin/bash

yarn install && authbind --deep pm2 startOrGracefulReload ecosystem.config.js production
