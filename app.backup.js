
import { Amplify } from 'aws-amplify';

import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  confirmSignIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  resetPassword,
  confirmResetPassword,
  updatePassword,
} from 'aws-amplify/auth';

import QRCode from 'qrcode';

// ---------- AWS COGNITO CONFIGURATION ----------

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-east-2_ejtyV8gQ8',
      userPoolClientId: '20k87u0u89k966g8309iu7o35g',
    },
  },
});

// ---------- BACKEND CONFIGURATION ----------

// Local Spring Boot API.
// For cloud deployment, replace this with your deployed API URL.
const API_BASE_URL = 'http://localhost:8080';

const $ = (id) => document.getElementById(id);

const titles = {
  signup: 'Create your account',
  verify: 'Check your email',
  login: 'Sign in',
  otp: 'Two-step verification',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
  home: 'Welcome back',
};

let pendingEmail = '';
let allJobs = [];
let jobsRequestId = 0;

// ---------- GENERAL UI FUNCTIONS ----------

function say(text, isError = false) {
  document.querySelectorAll('button[type="submit"]').forEach((b) => {
    b.disabled = false;
  });

  const el = $('message');
  el.textContent = text;
  el.className = isError ? 'message error' : 'message ok';
}

function show(name) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = true;
  });

  $('screen-' + name).hidden = false;
  $('title').textContent = titles[name];
  say('');
}

document.querySelectorAll('[data-go]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    show(link.dataset.go);
  });
});

const friendly = {
  UsernameExistsException:
    'This email is already registered. Try signing in.',

  InvalidPasswordException:
    'Password is too weak. Use 8+ characters with upper case, lower case, a number and a symbol.',

  CodeMismatchException:
    'That code is wrong. Check it and try again.',

  ExpiredCodeException:
    'That code has expired. Ask for a new one.',

  NotAuthorizedException:
    'Wrong email or password.',

  LimitExceededException:
    'Too many tries. Wait a few minutes and try again.',

  TooManyRequestsException:
    'Too many tries. Wait a few minutes and try again.',
};

function fail(err) {
  console.error(err);
  say(friendly[err.name] || err.message || 'Something went wrong.', true);
}

// ---------- COGNITO SIGNUP ----------

$('screen-signup').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = $('su-email').value.trim();
  const password = $('su-password').value;

  try {
    const { nextStep } = await signUp({
      username: email,
      password,
      options: {
        userAttributes: { email },
      },
    });

    pendingEmail = email;

    if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
      show('verify');
      say('We sent a 6-digit code to ' + email + '.');
    }
  } catch (err) {
    fail(err);
  }
});

// ---------- VERIFY EMAIL ----------

$('screen-verify').addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    await confirmSignUp({
      username: pendingEmail,
      confirmationCode: $('vf-code').value.trim(),
    });

    show('login');
    say('Email verified. You can sign in now.');
  } catch (err) {
    fail(err);
  }
});

// ---------- RESEND VERIFICATION CODE ----------

$('resend').addEventListener('click', async (e) => {
  e.preventDefault();

  try {
    await resendSignUpCode({
      username: pendingEmail,
    });

    say('A new code is on its way.');
  } catch (err) {
    fail(err);
  }
});

// =====================================================
// PHASE 3 — JOB LISTINGS DASHBOARD
// =====================================================

// ---------- LOAD JOBS FROM SPRING BOOT ----------

async function loadJobs() {
  const requestId = ++jobsRequestId;

  const jobsList = $('jobs-list');
  const status = $('jobs-status');

  status.textContent = 'Loading available jobs...';
  jobsList.replaceChildren();

  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    console.log('Public jobs API status:', response.status);

    if (!response.ok) {
      throw new Error(`Backend returned HTTP ${response.status}`);
    }

    const jobs = await response.json();

    if (!Array.isArray(jobs)) {
      throw new Error('Unexpected jobs response from backend.');
    }

    if (requestId !== jobsRequestId) {
      return;
    }

    allJobs = jobs;

    console.log('Jobs loaded from PostgreSQL:', allJobs.length);

    populateLocationFilter();
    filterJobs();

  } catch (error) {
    if (requestId !== jobsRequestId) {
      return;
    }

    console.error('Unable to load jobs:', error);

    allJobs = [];
    status.textContent =
      'Unable to load jobs. Check that Spring Boot is running on port 8080.';
  }
}

// ---------- POPULATE LOCATION FILTER ----------

function populateLocationFilter() {
  const locationSelect = $('job-location');

  const previousValue = locationSelect.value;

  const locations = [
    ...new Set(
      allJobs
        .map((job) => String(job.location ?? '').trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  locationSelect.replaceChildren();

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All locations';

  locationSelect.appendChild(allOption);

  locations.forEach((location) => {
    const option = document.createElement('option');

    option.value = location;
    option.textContent = location;

    locationSelect.appendChild(option);
  });

  if (locations.includes(previousValue)) {
    locationSelect.value = previousValue;
  }
}

// ---------- CREATE JOB CARDS ----------

function createJobCard(job) {
  const card = document.createElement('article');
  card.className = 'job-card';

  const title = document.createElement('h4');
  title.className = 'job-card-title';
  title.textContent = job.title || 'Untitled position';

  const company = document.createElement('p');
  company.className = 'job-card-company';
  company.textContent = job.company || 'Company not specified';

  const location = document.createElement('p');
  location.className = 'job-card-location';
  location.textContent = `Location: ${job.location || 'Not specified'}`;

  const detailsButton = document.createElement('button');
  detailsButton.type = 'button';
  detailsButton.className = 'btn ghost job-details-button';
  detailsButton.textContent = 'View Details';

  detailsButton.addEventListener('click', () => {
    const details = [
      `Job title: ${job.title || 'Not specified'}`,
      `Company: ${job.company || 'Not specified'}`,
      `Location: ${job.location || 'Not specified'}`,
    ];

    window.alert(details.join('\n'));
  });

  card.appendChild(title);
  card.appendChild(company);
  card.appendChild(location);
  card.appendChild(detailsButton);

  return card;
}

// ---------- DISPLAY JOBS ----------

function renderJobs(jobs) {
  const jobsList = $('jobs-list');
  const status = $('jobs-status');

  jobsList.replaceChildren();

  if (jobs.length === 0) {
    status.textContent = 'No jobs found matching your search.';
    return;
  }

  status.textContent =
    `${jobs.length} job${jobs.length === 1 ? '' : 's'} found`;

  jobs.forEach((job) => {
    jobsList.appendChild(createJobCard(job));
  });
}

// ---------- SEARCH AND FILTER JOBS ----------

function filterJobs() {
  const searchTerm = $('job-search').value.trim().toLowerCase();
  const selectedLocation = $('job-location').value.toLowerCase();

  const filteredJobs = allJobs.filter((job) => {
    const title = String(job.title ?? '').toLowerCase();
    const company = String(job.company ?? '').toLowerCase();
    const location = String(job.location ?? '').toLowerCase();

    const matchesSearch =
      title.includes(searchTerm) ||
      company.includes(searchTerm);

    const matchesLocation =
      !selectedLocation || location === selectedLocation;

    return matchesSearch && matchesLocation;
  });

  renderJobs(filteredJobs);
}

// ---------- SEARCH BUTTON ----------

$('search-jobs').addEventListener('click', () => {
  filterJobs();
});

// ---------- SEARCH AS USER TYPES ----------

$('job-search').addEventListener('input', () => {
  filterJobs();
});

// ---------- LOCATION CHANGE ----------

$('job-location').addEventListener('change', () => {
  filterJobs();
});

// =====================================================
// COGNITO SESSION AND PROTECTED BACKEND API
// =====================================================

async function checkCognitoSession() {
  try {
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken;

    if (!accessToken) {
      console.log('Cognito access token available: NO');
      return;
    }

    console.log('Cognito access token available: YES');

    try {
      const meResponse = await fetch(
        `${API_BASE_URL}/api/me`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken.toString()}`,
          },
        }
      );

      console.log('Protected API status:', meResponse.status);

      if (meResponse.ok) {
        const data = await meResponse.json();

        console.log('JWT authentication:', data.message);
      } else {
        console.error(
          'Protected API authentication failed:',
          meResponse.status
        );
      }

    } catch (error) {
      console.error(
        'Protected API connection failed:',
        error.message
      );
    }

  } catch (error) {
    console.error(
      'Unable to check Cognito session:',
      error.message
    );
  }
}

// ---------- HOME SCREEN ----------

async function showHome() {
  const user = await getCurrentUser();

  const who =
    user.signInDetails?.loginId || user.username;

  $('who').textContent = who;
  $('avatar').textContent = who.charAt(0).toUpperCase();

  show('home');

  // Load real job listings.
  // This is independent of the protected API check.
  void loadJobs();

  // Verify Cognito JWT against Spring Boot.
  void checkCognitoSession();
}

// ---------- HANDLE COGNITO SIGN-IN STEPS ----------

async function handleStep(output) {
  const step = output.nextStep.signInStep;

  switch (step) {
    case 'DONE':
      return showHome();

    case 'CONFIRM_SIGN_UP':
      await resendSignUpCode({
        username: pendingEmail,
      });

      show('verify');

      return say(
        'Please verify your email first. We sent a new code.'
      );

    case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP': {
      const details = output.nextStep.totpSetupDetails;

      const uri = details
        .getSetupUri('JSolutions', pendingEmail)
        .toString();

      $('qr').src = await QRCode.toDataURL(uri);
      $('secret').textContent = details.sharedSecret;

      $('qr-box').hidden = false;

      show('otp');
      $('qr-box').hidden = false;

      return say(
        'Scan the QR code with an authenticator app, then type the 6-digit code.'
      );
    }

    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      $('qr-box').hidden = true;
      show('otp');

      return say(
        'Open your authenticator app and type the 6-digit code.'
      );

    case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
    case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
      $('qr-box').hidden = true;
      show('otp');

      return say(
        'We sent you a code. Type it here.'
      );

    default:
      return say(
        'This sign-in step is not handled yet: ' + step,
        true
      );
  }
}

// ---------- SIGN IN ----------

$('screen-login').addEventListener('submit', async (e) => {
  e.preventDefault();

  pendingEmail = $('li-email').value.trim();

  try {
    const output = await signIn({
      username: pendingEmail,
      password: $('li-password').value,
    });

    await handleStep(output);

  } catch (err) {
    if (err.name === 'UserAlreadyAuthenticatedException') {
      return showHome();
    }

    fail(err);
  }
});

// ---------- MFA / OTP ----------

$('screen-otp').addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const output = await confirmSignIn({
      challengeResponse: $('otp-code').value.trim(),
    });

    $('otp-code').value = '';

    await handleStep(output);
  } catch (err) {
    fail(err);
  }
});

// ---------- FORGOT PASSWORD ----------

$('screen-forgot').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = $('fp-email').value.trim();

  try {
    const { nextStep } = await resetPassword({
      username: email,
    });

    pendingEmail = email;

    if (
      nextStep.resetPasswordStep ===
      'CONFIRM_RESET_PASSWORD_WITH_CODE'
    ) {
      show('reset');

      say(
        'We sent a code to ' +
        nextStep.codeDeliveryDetails.destination +
        '.'
      );
    }

  } catch (err) {
    fail(err);
  }
});

// ---------- RESET PASSWORD ----------

$('screen-reset').addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    await confirmResetPassword({
      username: pendingEmail,
      confirmationCode: $('rp-code').value.trim(),
      newPassword: $('rp-password').value,
    });

    show('login');

    say(
      'Password changed. Sign in with your new password.'
    );

  } catch (err) {
    fail(err);
  }
});

// ---------- CHANGE PASSWORD ----------

$('change-pw').addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    await updatePassword({
      oldPassword: $('cp-old').value,
      newPassword: $('cp-new').value,
    });

    $('change-pw').reset();
    say('Password updated.');

  } catch (err) {
    fail(err);
  }
});

// ---------- LOGOUT ----------

$('logout').addEventListener('click', async () => {
  try {
    await signOut();

    // Invalidate any pending job-list response.
    jobsRequestId++;

    allJobs = [];
    $('jobs-list').replaceChildren();
    $('jobs-status').textContent = 'Job listings will appear here.';

    show('login');

  } catch (err) {
    fail(err);
  }
});

// ---------- SUBMIT BUTTONS ----------

document.addEventListener('submit', (e) => {
  const btn = e.target.querySelector('button[type="submit"]');

  if (!btn) return;

  btn.disabled = true;

  setTimeout(() => {
    btn.disabled = false;
  }, 15000);

}, true);

// ---------- PASSWORD SHOW / HIDE ----------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-reveal]');

  if (!btn) return;

  const input = $(btn.dataset.reveal);
  const wasVisible = input.type === 'text';

  input.type = wasVisible ? 'password' : 'text';

  btn.textContent = wasVisible ? 'Show' : 'Hide';

  btn.setAttribute(
    'aria-label',
    wasVisible ? 'Show password' : 'Hide password'
  );
});

// ---------- START-UP ----------
// KEEP THIS BLOCK AT THE VERY BOTTOM.

(async () => {
  try {
    await getCurrentUser();
    await showHome();
  } catch {
    show('login');
  }
})();
