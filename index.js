import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import { getTemplatesByCategory } from './templates/index.js';

// 🎯 Cloudflare & RSS Parser Setup
const parser = new Parser({
  customFields: {
    item: [
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:content', 'mediaContent'],
      ['content:encoded', 'contentEncoded']
    ],
  }
});

// কনফিগারেশন
const RSS_FEED_URL = 'https://akashmiaofficial.icu/feeds/posts/default?alt=rss';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8699342196:AAF4_yh8glQWdCX1RdrUJQNusz94mKEXndA';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '@akashmiaofficial_icu';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1532845389210849472/APylkdSwvzB_MtQk1cVaK-_V4rjREKPEW_vfCedeG5Gw13F_8y82H4DXTtzz9QdbY8hk';

// 📁 data ফোল্ডার ও ফাইল পাথ
const DATA_DIR = path.join(process.cwd(), 'data');
const LAST_POST_FILE = path.join(DATA_DIR, 'last_post.json');

function extractMetadata(htmlContent) {
  const titleMatch = htmlContent.match(/title:\s*["']([^"']+)["']/i);
  const descMatch = htmlContent.match(/description:\s*[`"']([^`"']+)[`"']/i);
  const thumbMatch = htmlContent.match(/thumbnailUrl:\s*["']([^"']+)["']/i);

  return {
    title: titleMatch ? titleMatch[1] : null,
    description: descMatch ? descMatch[1] : null,
    thumbnailUrl: thumbMatch ? thumbMatch[1] : null,
  };
}

async function runLocalTest() {
  console.log('🔄 RSS Feed চেক করা হচ্ছে...');

  try {
    // 📁 ১. data ফোল্ডার না থাকলে স্বয়ংক্রিয়ভাবে তৈরি হবে
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // 📁 ২. আগের সেভ হওয়া পোস্টের লিঙ্ক পড়া
    let lastPostLink = '';
    if (fs.existsSync(LAST_POST_FILE)) {
      try {
        const savedData = JSON.parse(fs.readFileSync(LAST_POST_FILE, 'utf8'));
        lastPostLink = savedData.link || '';
      } catch (e) {
        console.log('⚠️ পুরোনো ফাইল পড়তে সমস্যা হয়েছে, নতুন সেভ ফাইল তৈরি হবে।');
      }
    }

    // ৩. Cloudflare Pass করার জন্য fetch দিয়ে Feed আনা
    const response = await fetch(RSS_FEED_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GitHub-Actions-AutoPostBot/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`Status code ${response.status}`);
    }

    const xmlData = await response.text();
    const feed = await parser.parseString(xmlData);

    if (feed.items && feed.items.length > 0) {
      const latestPost = feed.items[0];
      const postLink = latestPost.link || '';

      // 🎯 ৪. নতুন পোস্টটি আগের সেভ হওয়া পোস্টের সাথে মিললে স্কিপ করবে
      if (postLink && postLink === lastPostLink) {
        console.log('ℹ️ এই পোস্টটি আগেই পাঠানো হয়েছে। নতুন কোনো পোস্ট নেই!');
        return;
      }

      const fullContent = latestPost.content || latestPost['content:encoded'] || '';
      const categories = latestPost.categories || [];

      console.log(`🏷️ পোস্টের লেবেলসমূহ:`, categories);

      const meta = extractMetadata(fullContent);

      const finalTitle = meta.title || latestPost.title || 'New Post';
      const rawDesc = meta.description || latestPost.contentSnippet || '';
      const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
      const shortDescription = cleanDesc.length > 150 ? cleanDesc.slice(0, 150) + '...' : cleanDesc;
      const finalThumbnail = meta.thumbnailUrl;

      const postData = {
        title: finalTitle,
        description: shortDescription,
        postLink: postLink,
        thumbnailUrl: finalThumbnail
      };

      const { telegram, discord } = getTemplatesByCategory(categories, postData);

      // --- ৫. Telegram-এ পোস্ট পাঠানো ---
      let telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      let tgPayload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: telegram.caption,
        parse_mode: 'HTML',
        reply_markup: telegram.replyMarkup
      };

      if (finalThumbnail) {
        telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
        tgPayload = {
          chat_id: TELEGRAM_CHAT_ID,
          photo: finalThumbnail,
          caption: telegram.caption,
          parse_mode: 'HTML',
          reply_markup: telegram.replyMarkup
        };
      }

      console.log('📤 Telegram-এ পোস্ট পাঠানো হচ্ছে...');
      const tgRes = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgPayload)
      });
      const tgResult = await tgRes.json();

      if (tgResult.ok) console.log('✅ Telegram-এ পোস্ট সফল!');
      else console.error('❌ Telegram এরর:', tgResult.description || tgResult);

      // --- ৬. Discord-এ পোস্ট পাঠানো ---
      if (DISCORD_WEBHOOK_URL && DISCORD_WEBHOOK_URL.startsWith('http')) {
        console.log('📤 Discord Webhook-এ পোস্ট পাঠানো হচ্ছে...');
        const dcRes = await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discord)
        });

        if (dcRes.ok || dcRes.status === 204) {
          console.log('✅ Discord-এ Embed পোস্ট সফল!');
        } else {
          console.error('❌ Discord এরর Status:', dcRes.status);
        }
      } else {
        console.log('ℹ️ Discord Webhook URL সেট করা নেই, তাই Discord পোস্ট স্কিপ করা হলো।');
      }

      // 📁 ৭. পোস্ট সফল হলে data/last_post.json ফাইলে সেভ রাখা
      try {
        fs.writeFileSync(LAST_POST_FILE, JSON.stringify({ link: postLink, updated_at: new Date().toISOString() }, null, 2), 'utf8');
        console.log('💾 নতুন পোস্টের লিঙ্ক data/last_post.json ফাইলে সফলভাবে সেভ হয়েছে!');
      } catch (err) {
        console.error('❌ ফাইল সেভ করতে সমস্যা হয়েছে:', err.message);
      }

    } else {
      console.log('⚠️ RSS Feed-এ কোনো পোস্ট নেই।');
    }
  } catch (error) {
    console.error('❌ এরর ধরা পড়েছে:', error.message || error);
  }
}

runLocalTest();
