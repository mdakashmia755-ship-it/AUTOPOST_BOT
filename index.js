import { getTemplatesByCategory } from './templates/index.js';

// কনফিগারেশন
const RSS_FEED_URL = 'https://akashmiaofficial.icu/feeds/posts/default?alt=rss';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8699342196:AAF4_yh8glQWdCX1RdrUJQNusz94mKEXndA';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '@akashmiaofficial_icu';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1532845389210849472/APylkdSwvzB_MtQk1cVaK-_V4rjREKPEW_vfCedeG5Gw13F_8y82H4DXTtzz9QdbY8hk';

function parseRSSItem(xmlText) {
  const itemMatch = xmlText.match(/<item[\s\S]*?>([\s\S]*?)<\/item>/i);
  if (!itemMatch) return null;

  const itemXml = itemMatch[1];

  const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
  const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
  const contentMatch = itemXml.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i) ||
                       itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

  const categoryMatches = [...itemXml.matchAll(/<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)];
  const categories = categoryMatches.map(m => m[1].trim());

  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    link: linkMatch ? linkMatch[1].trim() : '',
    content: contentMatch ? contentMatch[1] : '',
    categories: categories
  };
}

// 🎯 পোস্ট কন্টেন্ট থেকে ইমেজ ও মেটাডাটা প্রপারলি বের করার ফাংশন
function extractMetadataAndImage(htmlContent) {
  const titleMatch = htmlContent.match(/title:\s*["']([^"']+)["']/i);
  const descMatch = htmlContent.match(/description:\s*[`"']([^`"']+)[`"']/i);
  const thumbMatch = htmlContent.match(/thumbnailUrl:\s*["']([^"']+)["']/i);

  // ১. মেটাডাটা থেকে থাম্বনেইল চেষ্টা করা
  let thumbnailUrl = thumbMatch ? thumbMatch[1] : null;

  // ২. মেটাডাটায় না পেলে HTML-এর প্রথম <img> ট্যাগ থেকে অরিজিনাল ছবি নেওয়া
  if (!thumbnailUrl) {
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/i;
    const imgMatch = htmlContent.match(imgRegex);
    if (imgMatch && imgMatch[1]) {
      thumbnailUrl = imgMatch[1];
    }
  }

  // ৩. ব্লগার থাম্বনেইল সাইজ হাই-রেজোলিউশনে ফিক্স করা
  if (thumbnailUrl && (thumbnailUrl.includes('blogger.googleusercontent.com') || thumbnailUrl.includes('bp.blogspot.com'))) {
    thumbnailUrl = thumbnailUrl.replace(/\/s\d+(-c)?\//, '/w640-h360/');
  }

  return {
    title: titleMatch ? titleMatch[1] : null,
    description: descMatch ? descMatch[1] : null,
    thumbnailUrl: thumbnailUrl
  };
}

async function runLocalTest() {
  console.log('🔄 RSS Feed চেক করা হচ্ছে...');

  try {
    const response = await fetch(RSS_FEED_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'GitHub-Actions-AutoPostBot/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error Status: ${response.status}`);
    }

    const xmlText = await response.text();
    const latestPost = parseRSSItem(xmlText);

    if (latestPost) {
      const postLink = latestPost.link || '';
      const fullContent = latestPost.content || '';
      const categories = latestPost.categories || [];

      console.log(`🏷️ পোস্টের লেবেলসমূহ:`, categories);

      const meta = extractMetadataAndImage(fullContent);

      const finalTitle = meta.title || latestPost.title || 'New Post';
      const rawDesc = meta.description || fullContent;
      const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
      const shortDescription = cleanDesc.length > 150 ? cleanDesc.slice(0, 150) + '...' : cleanDesc;
      const finalThumbnail = meta.thumbnailUrl;

      console.log('🖼️ ডিটেক্টেড ইমেজ URL:', finalThumbnail);

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
        reply_markup: telegram.replyMarkup,
        disable_web_page_preview: true // 🎯 লিঙ্ক প্রিভিউ বক্স বন্ধ রাখার জন্য
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
      console.log('⚠️ RSS Feed-এ কোনো পোস্ট পাওয়া যায়নি।');
    }
  } catch (error) {
    console.error('❌ এরর ধরা পড়েছে:', error.message || error);
  }
}

runLocalTest();
