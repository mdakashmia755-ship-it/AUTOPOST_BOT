import { getTemplatesByCategory } from './templates/index';

export default {
  // ১. Cron Trigger (অটোমেটিক প্রতি ৫/১০ মিনিট পর পর এটি চলবে)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkRssAndPost(env));
  },

  // ২. ব্রাউজার বা ম্যানুয়াল ইউআরএল হিট করে টেস্ট করার জন্য
  async fetch(request, env, ctx) {
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

// মূল প্রসেস ফাংশন
async function checkRssAndPost(env) {
  const RSS_URL = env.RSS_FEED_URL || 'https://akashmiaofficial.icu/feeds/posts/default?alt=rss';
  const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = env.TELEGRAM_CHAT_ID;
  const DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL;

  try {
    const res = await fetch(RSS_URL);
    const xmlText = await res.text();

    // RSS থেকে লিঙ্ক বের করা
    const linkMatch = xmlText.match(/<link[^>]*href=["']([^"']+)["']/i) || xmlText.match(/<link>([^<]+)<\/link>/i);
    const itemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/i) || xmlText.match(/<entry>([\s\S]*?)<\/entry>/i);

    if (!linkMatch || !itemMatch) {
      console.log("⚠️ RSS Feed-এ কোনো পোস্ট পাওয়া যায়নি।");
      return;
    }

    const latestLink = linkMatch[1];
    const fullContent = itemMatch[1];

    // ক্যাটাগরি / লেবেল বের করা
    const categoryMatches = [...fullContent.matchAll(/<category[^>]*term=["']([^"']+)["']/gi)];
    const categories = categoryMatches.map(m => m[1]);

    // Cloudflare KV থেকে শেষ পোস্ট করা লিঙ্ক চেক করা
    let lastPostedLink = null;
    if (env.TG_BOT_KV) {
      lastPostedLink = await env.TG_BOT_KV.get("LAST_POSTED_LINK");
    }

    // যদি নতুন পোস্ট হয়, তবেই কাজ করবে
    if (latestLink !== lastPostedLink) {
      const meta = extractMetadata(fullContent);

      const titleMatch = fullContent.match(/<title[^>]*>([^<]+)<\/title>/i);
      const defaultTitle = titleMatch ? titleMatch[1].replace("<![CDATA[", "").replace("]]>", "").trim() : 'New Post';

      const finalTitle = meta.title || latestPost.title || 'New Post';
      const rawDesc = meta.description || latestPost.contentSnippet || '';
      const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
      const shortDescription = cleanDesc.length > 150 ? cleanDesc.slice(0, 150) + '...' : cleanDesc;
      const finalThumbnail = meta.thumbnailUrl;

      const postData = {
        title: finalTitle,
        description: shortDescription,
        postLink: latestLink,
        thumbnailUrl: finalThumbnail
      };

      // ক্যাটাগরি অনুযায়ী টেমপ্লেট নির্বাচন
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

      // সফল হলে KV-তে লিঙ্ক সেভ করা
      if (tgResult.ok) {
        if (env.TG_BOT_KV) {
          await env.TG_BOT_KV.put("LAST_POSTED_LINK", latestLink);
        }
        console.log("✅ Successfully posted to Telegram & Discord!");
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
 
