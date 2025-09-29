module.exports = {
  apps: [
    {
      name: "discord-bot",
      script: "./index.js"
    }
  ],

  deploy: {
    production: {
      user: "khoa54087",
      host: "34.143.215.7",
      ref: "origin/main",
      repo: "https://github.com/KhoaHuuDeang/MdhhBot.git",
      path: "/home/khoa54087/MdhhBot",
      "post-deploy": "git reset --hard && git pull && npm install && npx prisma generate && pm2 restart discord-bot"
    }
  }
};


//pm2 deploy production setup
