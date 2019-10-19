module.exports = {
  apps : [{
    name: 'app',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    log_file: 'combined.log',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    }
  }],
  deploy : {
    production : {
      key: './credentials/ssh.private',
      user : 'app',
      host : '34.68.232.179',
      ref  : 'origin/master',
      repo : 'git@git.domain:euclid1990/alibaba-server.git',
      path : '/var/www/app',
      'ssh_options': ['StrictHostKeyChecking=no', 'UserKnownHostsFile=/dev/null'],
      'pre-setup': './scripts/setup.server.sh',
      'post-deploy' : '/bin/bash ./scripts/update.server.sh'
    }
  }
}
