const sessionMiddleware = (ctx, next) => {
  if (!ctx.session) {
    ctx.session = {};
  }
  return next();
};

module.exports = sessionMiddleware;
