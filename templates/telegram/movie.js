export function tgMovieTemplate(data) {
  return {
    caption: `━━━━━━━━━━━━━━━━━━━━━━\n` +
             `📌 <b>${data.title}</b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━\n` +
             `📝 <b>${data.description} </b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━\n` +
             ` Watch And Download 👉 <a href="${data.postLink}">Click Here</a> \n` +
             `━━━━━━━━━━━━━━━━━━━━━━\n`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '👇 WATCH AND DOWNLOAD CLICK THIS LINK 👇', callback_data: 'noop'}
        ],
        
        [
          { text: '🌐 VISIT LINKS ➔', url: data.postLink }
        ],

        [
          { text: '• 📌 FOLLOW US •', callback_data: 'noop' }
        ],

        [
          { text: '🔴 YouTube', url: 'https://youtube.com/@djakashmia' },
          { text: '👏 Facebook', url: 'https://facebook.com/akashmiaoffcical1' }
        ],
        [
          { text: '💜 Discord', url: 'https://discord.gg/f8WTD4zTfN'},
          { text: '😳 Instagram', url: 'https://instagram.com/@akashmia'}
        ]
      ]
    }
  };
}