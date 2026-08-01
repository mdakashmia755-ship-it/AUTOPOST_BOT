import { getTemplatesByCategory } from './templates/index.js';

export default {
  // ১. Cron Trigger
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkRssAndPost(env));
  },

  // ২. Manual / Browser Hit Trigger
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    await checkRssAndPost(env);
    return new Response("Auto-poster trigger status checked successfully!", {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
};

// 🎯 Thumbnail, Title & Description এক্সট্র্যাক্ট করার উন্নত ফাংশন
function extractMetadata(fullItemXml) {
  const titleMatch = fullItemXml.match(/title:\s*["']([^"']+)["']/i);
  const descMatch = fullItemXml.match(/description:\s*[`"']([^`"']+)[`"']/i);
  let thumbMatch = fullItemXml.match(/thumbnailUrl:\s*["']([^"']+)["']/i);

  let thumbnailUrl = thumbMatch ? thumbMatch[1] : null;

  // Localhost-এর rss-parser যেমন media:thumbnail / enclosure / img খুঁজে পায়, সেটির ম্যানুয়াল ফিক্স:
  if (!thumbnailUrl) {
    const mediaMatch = fullItemXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i) ||
                       fullItemXml.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
    if (mediaMatch) thumbnailUrl = mediaMatch[1];
  }

  if (!thumbnailUrl) {
    const imgMatch = fullItemXml.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) thumbnailUrl = imgMatch[1];
  }

  // Blogger low-resolution ইমেজকে হাই-রেজোলিউশন (s1600)-এ রূপান্তর
  if (thumbnailUrl && thumbnailUrl.includes('googleusercontent.com')) {
    thumbnailUrl = thumbnailUrl.replace(/\/s\d+(-c)?\//, '/s1600/');
  }

  return {
    title: titleMatch ? titleMatch[1] : null,
    description: descMatch ? descMatch[1] : null,
    thumbnailUrl: thumbnailUrl,
  };
}

async function checkRssAndPost(env) {
  const RSS_URL = env.RSS_FEED_URL || 'https://akashmiaofficial.icu/feeds/posts/default?alt=rss';
  const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = env.TELEGRAM_CHAT_ID;
  const DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL;

  try {
    const res = await fetch(RSS_URL);
    const xmlText = await res.text();

    const linkMatch = xmlText.match(/<link[^>]*href=["']([^"']+)["']/i) || xmlText.match(/<link>([^<]+)<\/link>/i);
    const itemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/i) || xmlText.match(/<entry>([\s\S]*?)<\/entry>/i);

    if (!linkMatch || !itemMatch) {
      console.log("⚠️ RSS Feed-এ কোনো পোস্ট পাওয়া যায়নি।");
      return;
    }

    const latestLink = linkMatch[1];
    const fullContent = itemMatch[1];

    // 🎯 RSS Feed থেকে Category / Label বের করা
    const categoryMatches = [
      ...fullContent.matchAll(/<category[^>]*term=["']([^"']+)["']/gi),
      ...fullContent.matchAll(/<category[^>]*>([^<]+)<\/category>/gi)
    ];
    
    const categories = [...new Set(categoryMatches.map(m => m[1]?.trim()).filter(Boolean))];

    console.log("🏷️ Cloudflare Extracted Labels:", categories);

    let lastPostedLink = null;
    if (env.TG_BOT_KV) {
      lastPostedLink = await env.TG_BOT_KV.get("LAST_POSTED_LINK");
    }

    if (latestLink !== lastPostedLink) {
      const meta = extractMetadata(fullContent);

      const titleMatch = fullContent.match(/<title[^>]*>([^<]+)<\/title>/i);
      const defaultTitle = titleMatch ? titleMatch[1].replace("<![CDATA[", "").replace("]]>", "").trim() : 'New Post';

      const finalTitle = meta.title || defaultTitle;
      const rawDesc = meta.description || '';
      const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
      const shortDescription = cleanDesc.length > 150 ? cleanDesc.slice(0, 150) + '...' : cleanDesc;
      const finalThumbnail = meta.thumbnailUrl;

      const postData = {
        title: finalTitle,
        description: shortDescription,
        postLink: latestLink,
        thumbnailUrl: finalThumbnail
      };

      const { telegram, discord } = getTemplatesByCategory(categories, postData);

      // --- ১. Telegram Post ---
      let telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      let tgPayload = {
        chat_id: CHAT_ID,
        text: telegram.caption,
        parse_mode: 'HTML',
        reply_markup: telegram.replyMarkup,
        disable_web_page_preview: true // এক্সট্রা লিংক প্রিভিউ অফ রাখবে
      };

      if (finalThumbnail) {
        telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
        tgPayload = {
          chat_id: CHAT_ID,
          photo: finalThumbnail,
          caption: telegram.caption,
          parse_mode: 'HTML',
          reply_markup: telegram.replyMarkup
        };
      }

      const tgRes = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tgPayload)
      });
      const tgResult = await tgRes.json();

      // --- ২. Discord Post ---
      if (DISCORD_WEBHOOK_URL && DISCORD_WEBHOOK_URL.startsWith('http')) {
        await fetch(DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discord)
        });
      }

      if (tgResult.ok) {
        if (env.TG_BOT_KV) {
          await env.TG_BOT_KV.put("LAST_POSTED_LINK", latestLink);
        }
        console.log("✅ Custom Template দিয়ে সফলভাবে পোস্ট করা হয়েছে!");
      } else {
        console.error("❌ Telegram Error:", tgResult);
      }
    } else {
      console.log("ℹ️ কোনো নতুন পোস্ট নেই।");
    }
  } catch (err) {
    console.error("❌ Worker Execution Error:", err);
  }
}
