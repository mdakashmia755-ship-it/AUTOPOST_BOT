import Parser from 'rss-parser';
import { getTemplatesByCategory } from './templates/index.js';

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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; 

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
    const feed = await parser.parseURL(RSS_FEED_URL);

    if (feed.items && feed.items.length > 0) {
      const latestPost = feed.items[0];
      const postLink = latestPost.link || '';
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

      // টেলিগ্রাম এবং ডিসকোর্ড উভয় টেমপ্লেট নিয়ে আসা
      const { telegram, discord } = getTemplatesByCategory(categories, postData);

      // --- ১. Telegram-এ পোস্ট পাঠানো ---
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

      // --- ২. Discord-এ পোস্ট পাঠানো ---
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

    } else {
      console.log('⚠️ RSS Feed-এ কোনো পোস্ট নেই।');
    }
  } catch (error) {
    console.error('❌ এরর ধরা পড়েছে:', error);
  }
}

runLocalTest();
