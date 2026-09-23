module.exports = {
  apps: [
    {
      name: 'safepet-server',
      script: 'server.js',
      cwd: '/opt/safepet-fulfillment',
      env: {
        NODE_ENV: 'production',
        PORT: 3006,
        TRIGGER_TAG: 'fulfill-ae'
      },
      restart_delay: 5000,
      max_restarts: 10
    },
    {
      name: 'safepet-watcher',
      script: 'watcher.js',
      cwd: '/opt/safepet-fulfillment',
      env: {
        NODE_ENV: 'production',
        TRIGGER_TAG: 'fulfill-ae',
        WATCHER_INTERVAL_MS: 15000
      },
      restart_delay: 5000,
      max_restarts: 10
    }
  ]
};
