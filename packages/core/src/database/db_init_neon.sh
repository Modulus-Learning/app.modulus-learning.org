#!/usr/bin/env bash
#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
#  Script to drop and recreate the development database.
#  NOTE: Only do this if you are sure you know what you're doing

source common.sh

echo 'Initializing DB (enter root password below)'
sed -e "s/\${db_name}/${POSTGRES_DATABASE}/" \
    -e "s/\${db_user}/${POSTGRES_USER}/" \
    -e "s/\${db_pass}/${POSTGRES_PASSWORD_ESC}/" db-reset.sql.template \
  | psql -h ep-lucky-sound-a1ku2x3c.ap-southeast-1.aws.neon.tech -U modulus_owner -d modulus -q
  
