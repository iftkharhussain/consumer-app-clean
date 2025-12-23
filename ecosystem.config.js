module.exports = {
  apps: [
    {
      name: 'consumer-app-dev',
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: true,
      ignore_watch: ['node_modules', 'logs', '.git', '*.log'],
      env_file: '.env.local',
      error_file: './logs/pm2-error-dev.log',
      out_file: './logs/pm2-out-dev.log',
      time: true,
      autorestart: true,
      max_memory_restart: '500M'
    },
    {
      name: 'consumer-app-prod',
      script: 'src/app.js',
      instances: 2,
      exec_mode: 'cluster',
      interpreter: 'node',
      interpreter_args: '-r dotenv/config',
      args: 'dotenv_config_path=.env.production',
      error_file: './logs/pm2-error-prod.log',
      out_file: './logs/pm2-out-prod.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1500M',
      kill_timeout: 5000
    }
  ]
};


// pm2 start ecosystem.config.js --only consumer-app-prod
