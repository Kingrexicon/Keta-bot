const { Markup } = require('telegraf');
const User = require('../../models/User');
const { validateName, validatePhoneNumber } = require('../../utils/validators');
const { mainMenu, phoneMenu } = require('../keyboards/mainMenu');
const { createBvnToken } = require('../../utils/bvnToken');

/**
 * Show the user's current profile details with options to edit.
 */
async function profileHandler(ctx) {
  const telegramId = ctx.from.id;
  const user = await User.findOne({ telegramId });

  if (!user) {
    await ctx.reply('❌ No account found. Please use /start to create an account first.');
    return;
  }

  const fullName = [user.surname, user.firstName, user.otherNames].filter(Boolean).join(' ');
  const phone = user.phoneNumber || 'Not set';
  const email = user.email || 'Not set';
  const kycStatus = user.kycStatus || 'PENDING';
  const bvnVerified = !!user.bvnVerified;

  const message =
    '👤 <b>My Profile</b>\n\n' +
    `📛 <b>Name:</b> ${fullName}\n` +
    `📱 <b>Phone:</b> <code>${phone}</code>\n` +
    `📧 <b>Email:</b> <code>${email}</code>\n` +
    `🆔 <b>Telegram ID:</b> <code>${telegramId}</code>\n` +
    `🔐 <b>BVN Status:</b> ${bvnVerified ? '✅ Verified' : '❌ Not verified'}\n` +
    `🛡️ <b>KYC Status:</b> ${kycStatus === 'VERIFIED' ? '✅ Verified' : '❌ ' + kycStatus}\n\n` +
    'What would you like to update?';

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📛 Edit Name', 'edit_name')],
      [Markup.button.callback('📱 Edit Phone Number', 'edit_phone')],
      [Markup.button.callback('📧 Edit Email', 'edit_email')],
      [Markup.button.callback('🔐 Verify BVN', 'edit_bvn')],
      [Markup.button.callback('❌ Close', 'edit_close')]
    ])
  });
}

/**
 * Start editing the user's name (surname -> first name -> other names).
 */
async function startEditName(ctx) {
  await ctx.answerCbQuery();
  ctx.session.editProfile = { field: 'name' };
  ctx.session.step = 'EDIT_SURNAME';
  await ctx.reply(
    '📛 <b>Edit Name</b>\n\nPlease enter your <b>surname (last name)</b>:',
    { parse_mode: 'HTML' }
  );
}

/**
 * Start editing the user's phone number.
 */
async function startEditPhone(ctx) {
  await ctx.answerCbQuery();
  ctx.session.editProfile = { field: 'phone' };
  ctx.session.step = 'EDIT_PHONE';
  await ctx.reply(
    '📱 <b>Edit Phone Number</b>\n\nPlease share your new phone number.\n\nTap <b>📱 Share Phone Number</b> to use the number linked to your Telegram account, or choose <b>✏️ Enter Manually</b>.',
    { parse_mode: 'HTML', ...phoneMenu() }
  );
}

/**
 * Start BVN verification (re-verify after editing details).
 */
async function startBvnVerification(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const user = await User.findOne({ telegramId });

  if (!user) {
    await ctx.reply('❌ No account found. Please use /start to create an account first.');
    return;
  }

  const appBase = process.env.APP_BASE_URL || 'https://keta-bot-79vw.onrender.com';
  const token = createBvnToken(user.telegramId);
  const verifyUrl = `${appBase}/bvn-verify?token=${token}`;
  const termsUrl = `${appBase}/terms`;

  await ctx.reply(
    '🔐 <b>BVN Verification</b>\n\n' +
    'BVN verification is a <b>one-time</b> thing we use for <b>security and fraud prevention</b>, and it is required to <b>receive payouts</b> from us.\n\n' +
    'Your BVN is submitted directly to <b>Anchor</b> (a licensed financial institution) for verification against NIBSS. <b>We do not store your raw BVN.</b>\n\n' +
    `Please read our <a href="${termsUrl}">Terms & Conditions</a> before proceeding.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('🔐 Verify BVN', verifyUrl)],
        [Markup.button.callback('⏭️ Skip for now', 'bvn_skip')]
      ])
    }
  );
}

/**
 * Handle surname entry during edit-name flow.
 */
async function handleEditSurname(ctx) {
  const surname = ctx.message.text.trim();

  if (!validateName(surname)) {
    return ctx.reply(
      '❌ Invalid surname. Please use letters only (2-100 characters).\n\nEnter your <b>surname (last name)</b>:',
      { parse_mode: 'HTML' }
    );
  }

  ctx.session.editProfile.surname = surname;
  ctx.session.step = 'EDIT_FIRST_NAME';
  await ctx.reply(
    `✅ Surname saved: <b>${surname}</b>\n\nNow enter your <b>first name</b>:`,
    { parse_mode: 'HTML' }
  );
}

/**
 * Handle first name entry during edit-name flow.
 */
async function handleEditFirstName(ctx) {
  const firstName = ctx.message.text.trim();

  if (!validateName(firstName)) {
    return ctx.reply(
      '❌ Invalid first name. Please use letters only (2-100 characters).\n\nEnter your <b>first name</b>:',
      { parse_mode: 'HTML' }
    );
  }

  ctx.session.editProfile.firstName = firstName;
  ctx.session.step = 'EDIT_OTHER_NAMES';
  await ctx.reply(
    `✅ First name saved: <b>${firstName}</b>\n\nEnter your <b>other names (middle names)</b>, or type <b>Skip</b> if you have none:`,
    { parse_mode: 'HTML' }
  );
}

/**
 * Handle other names entry during edit-name flow, then save.
 */
async function handleEditOtherNames(ctx) {
  const text = ctx.message.text.trim();
  const edit = ctx.session.editProfile || {};

  if (text.toLowerCase() === 'skip') {
    edit.otherNames = '';
  } else if (!validateName(text)) {
    return ctx.reply(
      '❌ Invalid name. Please use letters only, or type <b>Skip</b> if you have no other names.',
      { parse_mode: 'HTML' }
    );
  } else {
    edit.otherNames = text;
  }

  // Save the updated name to the user record
  const telegramId = ctx.from.id;
  const user = await User.findOne({ telegramId });
  if (user) {
    user.surname = edit.surname;
    user.firstName = edit.firstName;
    user.otherNames = edit.otherNames || '';
    // Name changed — reset BVN/KYC so the user re-verifies with correct details
    user.bvnVerified = false;
    user.bvnMasked = undefined;
    user.bvnVerifiedAt = undefined;
    user.bvnReference = undefined;
    user.kycStatus = 'PENDING';
    await user.save();
  }

  ctx.session.editProfile = null;
  ctx.session.step = null;

  await ctx.reply(
    '✅ <b>Name updated!</b>\n\nYour name has been saved. Since your details changed, please re-verify your BVN so your identity matches.',
    { parse_mode: 'HTML', ...mainMenu() }
  );

  // Offer BVN re-verification
  await startBvnVerification(ctx);
}

/**
 * Handle phone contact during edit-phone flow.
 */
async function handleEditPhoneContact(ctx) {
  const contact = ctx.message?.contact;
  if (!contact) return;

  if (ctx.session?.step !== 'EDIT_PHONE') return;

  // Security check: the shared contact must belong to the same Telegram user
  if (contact.user_id && contact.user_id !== ctx.from.id) {
    await ctx.reply(
      '❌ You can only share your own phone number.\n\nTap <b>📱 Share Phone Number</b> or choose <b>✏️ Enter Manually</b>.',
      { parse_mode: 'HTML', ...phoneMenu() }
    );
    return;
  }

  const phoneNumber = contact.phone_number;
  if (!phoneNumber || !validatePhoneNumber(phoneNumber)) {
    await ctx.reply(
      '❌ Invalid phone number received. Please try again or enter manually.',
      { parse_mode: 'HTML', ...phoneMenu() }
    );
    return;
  }

  await saveEditedPhone(ctx, phoneNumber, true);
}

/**
 * Handle manual phone entry during edit-phone flow.
 */
async function handleEditPhoneManual(ctx) {
  const text = ctx.message.text.trim();

  if (text === 'Cancel') {
    ctx.session.editProfile = null;
    ctx.session.step = null;
    return ctx.reply('Edit cancelled.', { parse_mode: 'HTML', ...mainMenu() });
  }

  if (text === '✏️ Enter Manually') {
    return ctx.reply(
      '✏️ Please type your <b>phone number</b> with country code (e.g. <code>+2348012345678</code>):',
      { parse_mode: 'HTML', ...phoneMenu() }
    );
  }

  if (!validatePhoneNumber(text)) {
    return ctx.reply(
      '❌ Invalid phone number. Please enter a valid number with country code (e.g. <code>+2348012345678</code>).',
      { parse_mode: 'HTML', ...phoneMenu() }
    );
  }

  await saveEditedPhone(ctx, text, false);
}

/**
 * Save the edited phone number to the user record.
 */
async function saveEditedPhone(ctx, phoneNumber, verifiedViaTelegram) {
  const telegramId = ctx.from.id;
  const user = await User.findOne({ telegramId });

  if (user) {
    user.phoneNumber = phoneNumber;
    user.phoneVerifiedViaTelegram = verifiedViaTelegram;
    // Phone changed — reset BVN/KYC so the user re-verifies with correct details
    user.bvnVerified = false;
    user.bvnMasked = undefined;
    user.bvnVerifiedAt = undefined;
    user.bvnReference = undefined;
    user.kycStatus = 'PENDING';
    await user.save();
  }

  ctx.session.editProfile = null;
  ctx.session.step = null;

  await ctx.reply(
    `✅ <b>Phone number updated!</b>\n\nYour new phone number is <code>${phoneNumber}</code>.\n\nSince your details changed, please re-verify your BVN so your identity matches.`,
    { parse_mode: 'HTML', ...mainMenu() }
  );

  // Offer BVN re-verification
  await startBvnVerification(ctx);
}

/**
 * Start editing the user's email address.
 */
async function startEditEmail(ctx) {
  await ctx.answerCbQuery();
  ctx.session.editProfile = { field: 'email' };
  ctx.session.step = 'EDIT_EMAIL';
  await ctx.reply(
    '📧 <b>Edit Email</b>\n\nPlease enter your new <b>email address</b> (e.g. <code>you@example.com</code>):',
    { parse_mode: 'HTML' }
  );
}

/**
 * Handle email entry during edit-email flow.
 */
async function handleEditEmail(ctx) {
  const text = ctx.message.text.trim();

  if (text === 'Cancel') {
    ctx.session.editProfile = null;
    ctx.session.step = null;
    return ctx.reply('Edit cancelled.', { parse_mode: 'HTML', ...mainMenu() });
  }

  // Simple email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return ctx.reply(
      '❌ Invalid email address. Please enter a valid email (e.g. <code>you@example.com</code>):',
      { parse_mode: 'HTML' }
    );
  }

  const telegramId = ctx.from.id;
  const user = await User.findOne({ telegramId });

  if (user) {
    user.email = text;
    await user.save();
  }

  ctx.session.editProfile = null;
  ctx.session.step = null;

  await ctx.reply(
    `✅ <b>Email updated!</b>\n\nYour new email address is <code>${text}</code>.`,
    { parse_mode: 'HTML', ...mainMenu() }
  );
}

/**
 * Close the profile menu.
 */
async function closeProfile(ctx) {
  await ctx.answerCbQuery('Closed');
  ctx.session.step = null;
  await ctx.reply('Profile closed.', { parse_mode: 'HTML', ...mainMenu() });
}

module.exports = {
  profileHandler,
  startEditName,
  startEditPhone,
  startEditEmail,
  startBvnVerification,
  handleEditSurname,
  handleEditFirstName,
  handleEditOtherNames,
  handleEditPhoneContact,
  handleEditPhoneManual,
  handleEditEmail,
  closeProfile
};
