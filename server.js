import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import { pool } from "./db.js";
import cron from "node-cron";
import districts from "./districts.json" assert { type: "json" };
dotenv.config();

const app = express();
app.use(express.json());

// ✅ CONFIG เปิด/ปิดโหมดทดสอบ
const TEST_MODE = true; // เปลี่ยนเป็น false ถ้าไม่อยากทดสอบทุก 1 นาที

// ✅ Route สำหรับตรวจว่า Server ทำงาน
app.get("/", (req, res) => {
  res.send("✅ Weather Alert Server is running!");
});

// ✅ Route สำหรับทดสอบ Push Message
app.get("/test-push", async (req, res) => {
  await pushMessageToAllUsers("🚀 ทดสอบ Push Message สำเร็จ!");
  res.send("✅ Push message sent!");
});

// ✅ Route สำหรับทดสอบ Weather API
app.get("/test-weather", async (req, res) => {
  await checkWeatherAndPush();
  res.send("✅ Weather checked!");
});

app.post("/webhook", async (req, res) => {
  const event = req.body.events?.[0];
  if (!event) return res.sendStatus(200);

  const userId = event.source?.userId;

  if (userId) {
    const checkUser = await pool.query(
      "SELECT user_id FROM line_users WHERE user_id = $1",
      [userId]
    );

    if (checkUser.rowCount === 0) {
      await pool.query("INSERT INTO line_users (user_id) VALUES ($1)", [
        userId,
      ]);
      console.log(`✅ เพิ่ม userId ใหม่: ${userId}`);
    } else {
      console.log(`ℹ️ userId นี้มีอยู่แล้ว: ${userId}`);
    }
  }

  if (event.type === "message" && event.message.type === "text") {
    console.log(`📩 ข้อความจาก ${userId}: ${event.message.text}`);
  }

  res.sendStatus(200);
});

async function pushMessage(to, text) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: to,
        messages: [{ type: "text", text: text }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}`,
        },
      }
    );
    console.log(`✅ ส่งข้อความไปยัง user: ${to}`);
  } catch (err) {
    console.error("❌ Push message error:", err.response?.data || err.message);
  }
}

async function pushMessageToAllUsers(message) {
  const users = await pool.query("SELECT user_id FROM line_users");
  console.log(`📢 กำลังส่งข้อความถึง ${users.rowCount} คน`);
  for (const row of users.rows) {
    await pushMessage(row.user_id, message);
  }
}

async function checkWeatherAndPush() {
  for (const d of districts) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${d.lat}&lon=${d.lng}&appid=${process.env.WEATHER_KEY}&units=metric&lang=th`;
      const { data } = await axios.get(url);
      const weather = data.weather[0].main;

      console.log(`🌤 Checking ${d.name}: ${weather}`);

      if (["Rain", "Thunderstorm"].includes(weather)) {
        const message = `⛈️ แจ้งเตือนฝนตก!
📍 พื้นที่: ${d.name}
🌧️ สภาพอากาศ: ${data.weather[0].description}
🌡️ อุณหภูมิ: ${data.main.temp}°C
โปรดวางแผนการเดินทางและพกร่มด้วยนะครับ`;
        await pushMessageToAllUsers(message);
      }
    } catch (err) {
      console.error(`❌ Error checking ${d.name}:`, err.message);
    }
  }
}

// ✅ ถ้า TEST_MODE = true → เช็กทุก 1 นาที
cron.schedule(TEST_MODE ? "* * * * *" : "*/10 * * * *", checkWeatherAndPush);

// ✅ ใช้ PORT ของ Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(
    `✅ Server started on port ${PORT} (${
      TEST_MODE ? "TEST MODE (1min)" : "NORMAL MODE (10min)"
    })`
  )
);
