const User = require('../../models/User');
const { validateName, validatePhoneNumber } = require('../../utils/validators');
const { phoneMenu, skipMenu, mainMenu } = require('../keyboards/mainMenu');

/**
 * Check whether a user has completed onboarding
 * (has surname, first name, and phone number)
 */
function isOnboardingComplete(user) {
  return !!(
    user &&
    user.surname &&
    user.firstName &&
    user.phoneNumber
  );
}

/**
 * Start the onboarding flow
 * Order: surname -> first name -> other names (optional) -> phone
 */
async function startOnboarding(ctx) {
  ctx.session.onboarding = {};
  ctx.session.step = 'ENTER_SURNAME';
  await ctx.reply(
    '👋 <b>Welcome to KetaBot!</b>\n\nBefore we get started, we need a few details.\n\n<b>Step 1/4:</b> Please enter your <b>surname (last name)</b>:',
    { parse_mode: 'HTML' }
  );
}

async function handleSurname(ctx) {
  const surname = ctx.message.text.trim();

  if (!validateName(surname)) {
    return ctx.reply(
      '❌ Invalid surname. Please use letters only (2-100 characters).\n\nEnter your <b>surname (last name)</b>:',
      { parse_mode: 'HTML' }
    );
  }

  ctx.session.onboarding.surname = surname;
  ctx.session.step = 'ENTER_FIRST_NAME';
  await ctx.reply(
    `✅ Surname saved: <b>${surname}</b>\n\n<b>Step 2/4:</b> Please enter your <b>first name</b>:`,
    { parse_mode: 'HTML' }
  );
}

async function handleFirstName(ctx) {
  const firstName = ctx.message.text.trim();

  if (!validateName(firstName)) {
    return ctx.reply(
      '❌ Invalid first name. Please use letters only (2-100 characters).\n\nEnter your <b>first name</b>:',
      { parse_mode: 'HTML' }
    );
  }

  ctx.session.onboarding.firstName = firstName;
  ctx.session.step = 'ENTER_OTHER_NAMES';
  await ctx.reply(
    `✅ First name saved: <b>${firstName}</b>\n\n<b>Step 3/4:</b> Enter your <b>other names (middle names)</b>, or tap <b>⏭️ Skip</b> if you have none:`,
    { parse_mode: 'HTML', ...skipMenu() }
  );
}

async function handleOtherNames(ctx) {
  const text = ctx.message.text.trim();

  if (text === 'Cancel') {
    return cancelOnboarding(ctx);
  }

  if (text === '⏭️ Skip') {
    ctx.session.onboarding.otherNames = '';
  } else if (!validateName(text)) {
    return ctx.reply(
      '❌ Invalid name. Please use letters only, or tap <b>⏭️ Skip</b> if you have no other names.',
      { parse_mode: 'HTML', ...skipMenu() }
    );
  } else {
    ctx.session.onboarding.otherNames = text;
  }

  ctx.session.step = 'ENTER_PHONE';
  await ctx.reply(
    '✅ <b>Step 4/4:</b> Please share your <b>phone number</b>.\n\nTap <b>📱 Share Phone Number</b> to use the number linked to your Telegram account, or choose <b>✏️ Enter Manually</b>.',
    { parse_mode: 'HTML', ...phoneMenu() }
  );
}

/**
 * Handle the native Telegram contact-share button.
 * The number arrives pre-verified by Telegram (linked to the account).
 */
async function handlePhoneContact(ctx) {
  const contact = ctx.message?.contact;
  if (!contact) return;

  if (ctx.session?.step !== 'ENTER_PHONE') {
    // Not in phone onboarding - ignore
    return;
  }

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

  await completeOnboarding(ctx, {
    phoneNumber,
    phoneVerifiedViaTelegram: true
  });
}

/**
 * Handle manual phone entry (fallback path).
 * Numbers entered manually are NOT marked as Telegram-verified.
 */
async function handlePhoneManual(ctx) {
  const text = ctx.message.text.trim();

  if (text === 'Cancel') {
    return cancelOnboarding(ctx);
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

  await completeOnboarding(ctx, {
    phoneNumber: text,
    phoneVerifiedViaTelegram: false
  });
}

/**
 * Save the user to the database and show the main menu.
 * Creates a new record if the user doesn't exist yet; otherwise updates.
 */
async function completeOnboarding(ctx, phoneData) {
  const onboarding = ctx.session.onboarding || {};
  const { id, username } = ctx.from;

  // Use the user-entered first name; fall back to Telegram's if somehow missing
  const firstName = onboarding.firstName || ctx.from.first_name || '';
  const surname = onboarding.surname || '';
  const otherNames = onboarding.otherNames || '';

  let user = await User.findOne({ telegramId: id });

  if (user) {
    user.surname = surname;
    user.firstName = firstName;
    user.otherNames = otherNames;
    user.phoneNumber = phoneData.phoneNumber;
    user.phoneVerifiedViaTelegram = phoneData.phoneVerifiedViaTelegram;
    await user.save();
  } else {
    user = await User.create({
      telegramId: id,
      username,
      firstName,
      surname,
      otherNames,
      phoneNumber: phoneData.phoneNumber,
      phoneVerifiedViaTelegram: phoneData.phoneVerifiedViaTelegram
    });
  }

  ctx.session.onboarding = null;
  ctx.session.step = null;

  await ctx.reply(
    '✅ <b>Profile Complete!</b>\n\nWelcome to KetaBot. What would you like to do?',
    { parse_mode: 'HTML', ...mainMenu() }
  );
}

async function cancelOnboarding(ctx) {
  ctx.session.onboarding = null;
  ctx.session.step = null;
  await ctx.reply(
    'Onboarding cancelled. Tap <b>Start</b> or <b>Reset</b> to try again.',
    { parse_mode: 'HTML', ...mainMenu() }
  );
}

module.exports = {
  startOnboarding,
  handleSurname,
  handleFirstName,
  handleOtherNames,
  handlePhoneContact,
  handlePhoneManual,
  cancelOnboarding,
  isOnboardingComplete
};