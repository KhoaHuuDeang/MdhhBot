module.exports = {
  apps: [
    {
      name: "discord-bot",
      script: "index.js",
      env: {
        NODE_ENV: "production"
      }
    }
  ],

  deploy: {
    production: {
      user: "khoa54087",
      host: "34.143.215.7",
      ref: "origin/main",
      repo: "https://github.com/KhoaHuuDeang/MdhhBot.git",
      path: "/home/khoa54087/MdhhBot",
      "post-deploy":
        "npm install && pm2 reload ecosystem.config.js --env production"
    }
  }
};
