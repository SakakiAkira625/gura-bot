module.exports = {
  apps: [{
    name: "gura-bot",
    script: "./src/index.js",
    watch: ["src", ".env", "package.json"],
    ignore_watch: ["src/data", "node_modules", "logs", ".git", "*.log", "scratch", "tests"],
    max_memory_restart: "800M",
    env: {
      NODE_ENV: "production",
    },
    error_file: "./logs/pm2-error.log",
    out_file: "./logs/pm2-out.log",
    time: true
  }]
};
