function objectKeyFromUrl(input) {
  if (!input) return '';
  const url = String(input).trim();
  if (!url) return '';

  // If it's already an object key
  if (!/^https?:\/\//i.test(url)) return url.replace(/^\//, '');

  try {
    const u = new URL(url);
    // pathname: "/tech-solution/2025/..."
    return String(u.pathname || '').replace(/^\//, '');
  } catch (e) {
    return '';
  }
}

module.exports = {
  objectKeyFromUrl
};


