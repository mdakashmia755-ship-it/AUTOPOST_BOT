import { getTemplatesByCategory } from './templates/index.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

async function runLocalTest() {
  console.log('🔄 Cloudflare Bypass করে RSS Feed চেক করা হচ্ছে...');

  try {
    // 🎯 Cloudflare Bypass API Endpoint
    const BLOG_FEED_URL = 'https://www.akashmiaofficial.icu/feeds/posts/default?alt=rss';
    const API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(BLOG_FEED_URL)}`;

    const response = await fetch(API_URL);
    const data = await response.json();

    if (data.status === 'ok' && data.items && data.items.length > 0) {
      const latestPost = data.items[0];
      const postLink = latestPost.link || '';
      const fullContent = latestPost.content || latestPost.description || '';
      const categories = latestPost.categories || [];

      console.log(`🏷️ পোস্টের লেবেলসমূহ:`, categories);

      const finalTitle = latestPost.title || 'New Post';
      const cleanDesc = fullContent.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
      const shortDescription = cleanDesc.length > 150 ? cleanDesc.slice(0, 150) + '...' : cleanDesc;
      const finalThumbnail = latestPost.thumbnail || latestPost.enclosure?.link;

      const postData = {
        title: finalTitle,
        description: shortDescription,
        postLink: postLink,
        thumbnailUrl: finalThumbnail
      };

      const { telegram, discord } = getTemplatesByCategory(categories, postData);

      // --- ১. Telegram ---
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

      // --- ২. Discord ---
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
      }

    } else {
      console.log('⚠️ RSS Feed পাওয়া যায়নি বা Cloudflare ব্লক করেছে।');
    }
  } catch (error) {
    console.error('❌ এরর ধরা পড়েছে:', error);
  }
}

runLocalTest();
