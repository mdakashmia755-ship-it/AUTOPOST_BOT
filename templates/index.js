import { tgMovieTemplate } from './telegram/movie.js';
import { tgDefaultTemplate } from './telegram/default.js';

import { dcMovieTemplate } from './discord/movie.js';
import { dcDefaultTemplate } from './discord/default.js';

// ব্লগারের ডিফাইন করা Label তালিকা
const CATEGORY_MAP = {
  movie: ['movie', 'movies', 'cinema', 'bollywood', 'hollywood', 'south movie', 'web series', 'drama']
};

export function getTemplatesByCategory(postCategories, data) {
  const labels = (Array.isArray(postCategories) ? postCategories : [postCategories])
    .map(cat => {
      if (!cat) return '';
      if (typeof cat === 'string') return cat.toLowerCase().trim();
      if (typeof cat === 'object') return (cat._ || cat.term || '').toLowerCase().trim();
      return '';
    })
    .filter(Boolean);

  const isMovie = labels.some(label => CATEGORY_MAP.movie.includes(label));

  if (isMovie) {
    return {
      telegram: tgMovieTemplate(data),
      discord: dcMovieTemplate(data)
    };
  }

  return {
    telegram: tgDefaultTemplate(data),
    discord: dcDefaultTemplate(data)
  };
}