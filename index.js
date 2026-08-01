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

// HTML Content থেকে Title, Description, Thumbnail বের করার ফাংশন
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

    // 🎯 Blogger Feed থেকে সবধরনের Category / Label সঠিকভাবে রিড করার নিখুঁত লজিক
    const categoryMatches = [
      ...fullContent.matchAll(/<category[^>]*term=["']([^"']+)["']/gi),
      ...fullContent.matchAll(/<category[^>]*>([^<]+)<\/category>/gi)
    ];
    
    // ক্যাটাগরিগুলো ফিল্টার করে ক্লিন অ্যারে বানানো
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

      // 🎯 সরাসরি আপনার templates/index.js-কে কল করা (কোনো ফলব্যাক ছাড়া)
      const { telegram, discord } = getTemplatesByCategory(categories, postData);

      // --- ১. Telegram Post ---
      let telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      let tgPayload = {
        chat_id: CHAT_ID,
        text: telegram.caption,
        parse_mode: 'HTML',
        reply_markup: telegram.replyMarkup
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
        console.log("✅ Custom Template দিয়ে সফলভাবে পোস্ট করা হয়েছে!");
      } else {
        console.error("❌ Telegram Error:", tgResult);
      }
    } else {
      console.log("ℹ️ কোনো নতুন পোস্ট নেই, লাস্ট পোস্ট আপডেট করা শেষ।");
    }
  } catch (err) {
    console.error("❌ Worker Execution Error:", err);
  }
}
