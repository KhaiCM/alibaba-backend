#!/bin/bash

source_domain="git.domain"
source_username="euclid1990"
ssh_config_file_path="$HOME/.ssh/config"
ssh_private_key_path="/var/www/app/ssh.private.key"
bashrc_path="$HOME/.bashrc"
profile_path="$HOME/.profile"
npm_directory="$HOME/.npm-global"

define() { IFS='\n' read -r -d '' ${1} || true; }

count_sub_string() { echo $(cat $2 | grep -c $1); }

mkfile() { path=$1; if [ ! -f $path ]; then touch $path; fi }

reload_bash() {
  source $profile_path
  source $bashrc_path
}

# Github deploy ssh private key
define SSH_PRIVATE_KEY <<EOF
EOF

# Sever ssh configuration for git.domain alternative github.com
define SSH_CONFIGURATION <<EOF
Host $source_domain
  HostName github.com
  User $source_username
  IdentityFile $ssh_private_key_path
  StrictHostKeyChecking no
EOF

# Make directory
mkdir -p $npm_directory
sudo mkdir -p /var/www/app
sudo chown $USER:$USER /var/www/app

# Install require packages
sudo curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt-get update
sudo apt-get install -y build-essential python git nodejs authbind

# Make npm can using by non-root
sudo chown -R $USER /usr/lib/node_modules
npm config set prefix "$npm_directory"
count=$(count_sub_string "$npm_directory" $bashrc_path)
if [ $count -eq 0 ]; then
  # Export bin directory
  path="export PATH=$npm_directory/bin"':$PATH'
  # Insert at top file
  sed -i '1s|^|'"$path"'\n|' $profile_path
  sed -i '1s|^|'"$path"'\n|' $bashrc_path
  reload_bash
  echo "Non root can installing packages globally"
else
  echo "Global installing packages has already config"
fi

# Install npm global packages
npm install -g yarn node-gyp pm2

# Generate deploy ssh private key
if [ ! -f $ssh_private_key_path ]; then
  echo "$SSH_PRIVATE_KEY" > $ssh_private_key_path
  sudo chmod 600 $ssh_private_key_path
  echo "$ssh_private_key_path has successfully config"
else
  echo "$ssh_private_key_path has already config"
fi

# Make ssh config
count=$(count_sub_string "$source_domain" $ssh_config_file_path)
if [ $count -eq 0 ]; then
  # Preserves newlines
  echo "$SSH_CONFIGURATION" >> $ssh_config_file_path
  echo "$ssh_config_file_path has successfully config"
else
  echo "$ssh_config_file_path has already config"
fi

# Allow non-root can bind to ports less than 1024
sudo touch /etc/authbind/byport/80
sudo chown $USER:$USER /etc/authbind/byport/80
sudo chmod 755 /etc/authbind/byport/80

# Remove existing deploy
pm2 delete app
rm -rf /var/www/app/current
rm -rf /var/www/app/source
rm -rf /var/www/app/share
rm -rf /var/www/app/.deploys
