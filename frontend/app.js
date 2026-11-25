
import { Amplify } from 'aws-amplify';
import {
  signUp, confirmSignUp, resendSignUpCode,
  signIn, confirmSignIn, signOut, getCurrentUser,
  fetchAuthSession, resetPassword,
  confirmResetPassword, updatePassword
} from 'aws-amplify/auth';
import QRCode from 'qrcode';

// ============================================
// AWS COGNITO
// ============================================

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-east-2_ejtyV8gQ8',
      userPoolClientId: '20k87u0u89k966g8309iu7o35g'
    }
  }
});

const API = 'http://localhost:8080';
const $ = id => document.getElementById(id);

const titles = {
  signup: 'Create your account',
  verify: 'Check your email',
  login: 'Sign in',
  otp: 'Two-step verification',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
  home: 'Find Jobs',
  settings: 'Account Settings'
};

let pendingEmail = '';
let allJobs = [];
let currentRole = null;
let currentUserId = null;
let jobsRequestId = 0;
let myApplications = [];

// ============================================
// GENERAL UI
// ============================================

function say(message, error = false) {
  const element = $('message');
  if (!element) return;

  element.textContent = message;
  element.className = error
    ? 'message error'
    : 'message ok';
}

function show(screenName) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.hidden = true;
  });

  const screen = $('screen-' + screenName);

  if (!screen) {
    console.error('Screen missing:', screenName);
    return;
  }

  screen.hidden = false;

  document.querySelector('.shell')?.classList.toggle(
    'portal-mode',
    ['home', 'settings'].includes(screenName)
  );

  if ($('title')) {
    $('title').textContent =
      titles[screenName] || 'JSolutions';
  }

  say('');
}

document.querySelectorAll('[data-go]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    show(link.dataset.go);
  });
});

const friendlyErrors = {
  UsernameExistsException:
    'This email is already registered.',
  InvalidPasswordException:
    'Password does not meet security requirements.',
  CodeMismatchException:
    'Incorrect verification code.',
  ExpiredCodeException:
    'Verification code expired.',
  NotAuthorizedException:
    'Authentication failed.',
  LimitExceededException:
    'Too many attempts. Please try later.'
};

function fail(error) {
  console.error(error);

  say(
    friendlyErrors[error.name] ||
    error.message ||
    'Something went wrong.',
    true
  );
}

// ============================================
// AUTHENTICATION
// ============================================

async function getAccessToken() {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken;

  if (!token) {
    throw new Error('Please sign in again.');
  }

  return token;
}

async function detectUserRole() {
  const token = await getAccessToken();

  const groups =
    token.payload['cognito:groups'] || [];

  currentUserId = String(token.payload.sub || '');

  if (
    groups.includes('EMPLOYER') &&
    groups.includes('JOB_SEEKER')
  ) {
    currentRole = null;
    throw new Error('Conflicting account roles.');
  }

  currentRole = groups.includes('EMPLOYER')
    ? 'EMPLOYER'
    : groups.includes('JOB_SEEKER')
      ? 'JOB_SEEKER'
      : null;

  console.log('Cognito role:', currentRole);
  return currentRole;
}

// ============================================
// AUTHENTICATED API REQUEST
// ============================================

async function authenticatedRequest(
  path,
  method = 'GET',
  body = null
) {
  const token = await getAccessToken();

  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.toString()}`,
      Accept: 'application/json',
      ...(body !== null
        ? { 'Content-Type': 'application/json' }
        : {})
    },
    ...(body !== null
      ? { body: JSON.stringify(body) }
      : {})
  });

  if (!response.ok) {
    let detail = '';

    try {
      detail = await response.text();
    } catch {
      // Use HTTP status if no body is available.
    }

    if (response.status === 403) {
      throw new Error('Access denied for this account.');
    }

    if (response.status === 409) {
      throw new Error(
        detail || 'You have already applied for this job.'
      );
    }

    throw new Error(
      `HTTP ${response.status}: ${detail || response.statusText}`
    );
  }

  if (response.status === 204) return null;

  return response.json();
}

// ============================================
// LOAD JOBS
// ============================================

async function loadJobs() {
  const requestId = ++jobsRequestId;
  const list = $('jobs-list');
  const status = $('jobs-status');

  status.textContent = 'Loading jobs...';
  list.replaceChildren();

  try {
    const response = await fetch(`${API}/api/jobs`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const jobs = await response.json();

    if (!Array.isArray(jobs)) {
      throw new Error('Invalid jobs response.');
    }

    if (requestId !== jobsRequestId) return;

    allJobs = jobs;
    populateLocationFilter();
    filterJobs();

    console.log(
      'Jobs loaded from PostgreSQL:',
      jobs.length
    );
  } catch (error) {
    if (requestId !== jobsRequestId) return;

    console.error(error);
    allJobs = [];

    status.textContent =
      'Unable to load jobs. Check Spring Boot on port 8080.';
  }
}

function populateLocationFilter() {
  const select = $('job-location');
  const previous = select.value;

  const locations = [
    ...new Set(
      allJobs
        .map(job => String(job.location || '').trim())
        .filter(Boolean)
    )
  ].sort();

  select.replaceChildren();

  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All locations';
  select.appendChild(all);

  locations.forEach(location => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    select.appendChild(option);
  });

  if (locations.includes(previous)) {
    select.value = previous;
  }
}

// ============================================
// JOB CARDS
// ============================================

function createJobCard(job) {
  const card = document.createElement('article');
  card.className = 'job-card';

  const title = document.createElement('h4');
  title.className = 'job-card-title';
  title.textContent = job.title || 'Untitled position';

  const company = document.createElement('p');
  company.className = 'job-card-company';
  company.textContent = job.company || 'Unknown company';

  const location = document.createElement('p');
  location.className = 'job-card-location';
  location.textContent =
    `Location: ${job.location || 'Not specified'}`;

  const details = document.createElement('button');
  details.type = 'button';
  details.className = 'btn ghost job-details-button';
  details.textContent = 'View Details';

  details.addEventListener('click', () => {
    alert(
      `Job: ${job.title}\n` +
      `Company: ${job.company}\n` +
      `Location: ${job.location}`
    );
  });

  card.append(title, company, location, details);
  displayCompanyLogo(card, job);

  if (currentRole === 'JOB_SEEKER') {
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn';
    apply.style.marginLeft = '8px';

    const alreadyApplied = myApplications.some(
      application => Number(application.jobId) === Number(job.id)
    );

    apply.textContent = alreadyApplied
      ? 'Already Applied'
      : 'Apply for Job';

    apply.disabled = alreadyApplied;

    apply.addEventListener('click', async () => {
      if (!confirm(`Apply for "${job.title}"?`)) return;

      apply.disabled = true;
      apply.textContent = 'Applying...';

      try {
        await authenticatedRequest(
          '/api/applications',
          'POST',
          { jobId: Number(job.id) }
        );

        await loadMyApplications();

        alert('Application submitted successfully!');
      } catch (error) {
        alert(error.message);
        apply.disabled = false;
        apply.textContent = 'Apply for Job';
      }
    });

    card.appendChild(apply);
  }

  return card;
}

function renderJobs(jobs) {
  const list = $('jobs-list');
  const status = $('jobs-status');

  list.replaceChildren();

  status.textContent =
    `${jobs.length} job${jobs.length === 1 ? '' : 's'} found`;

  if (jobs.length === 0) {
    status.textContent =
      'No jobs found matching your search.';
    return;
  }

  jobs.forEach(job => {
    list.appendChild(createJobCard(job));
  });
}

function filterJobs() {
  const search =
    $('job-search').value.trim().toLowerCase();

  const location =
    $('job-location').value.toLowerCase();

  const filtered = allJobs.filter(job => {
    const matchesSearch =
      String(job.title || '').toLowerCase().includes(search) ||
      String(job.company || '').toLowerCase().includes(search);

    const matchesLocation =
      !location ||
      String(job.location || '').toLowerCase() === location;

    return matchesSearch && matchesLocation;
  });

  renderJobs(filtered);
}

$('search-jobs').addEventListener('click', filterJobs);
$('job-search').addEventListener('input', filterJobs);
$('job-location').addEventListener('change', filterJobs);

// ============================================

// ============================================
// JOB SEEKER DASHBOARD
// ============================================

function createJobSeekerDashboard() {
  let dashboard = $('jobseeker-dashboard');
  if (dashboard) return dashboard;

  dashboard = document.createElement('section');
  dashboard.id = 'jobseeker-dashboard';
  dashboard.className = 'employer-dashboard';

  Object.assign(dashboard.style, {
    marginTop: '32px',
    padding: '24px',
    border: '1px solid #d5dce5',
    borderRadius: '14px'
  });

  // ============================================
  // RESUME UPLOAD
  // ============================================

  const resumeSection = document.createElement('section');
  resumeSection.style.marginBottom = '28px';

  const resumeHeading = document.createElement('h2');
  resumeHeading.textContent = 'Upload My Resume';

  const resumeDescription = document.createElement('p');
  resumeDescription.textContent =
    'Choose a PDF resume (maximum 5 MB).';

  const resumeInput = document.createElement('input');
  resumeInput.id = 'resume-file';
  resumeInput.type = 'file';
  resumeInput.accept = '.pdf,application/pdf';
  resumeInput.setAttribute('aria-label', 'Choose PDF resume');
  resumeInput.style.display = 'block';
  resumeInput.style.marginBottom = '12px';

  const resumeButton = document.createElement('button');
  resumeButton.type = 'button';
  resumeButton.className = 'btn';
  resumeButton.textContent = 'Upload Resume';

  const resumeStatus = document.createElement('p');
  resumeStatus.id = 'resume-upload-status';
  resumeStatus.setAttribute('role', 'status');
  resumeStatus.setAttribute('aria-live', 'polite');

  resumeButton.addEventListener('click', async () => {
    const file = resumeInput.files?.[0];

    if (!file) {
      resumeStatus.textContent =
        'Please select a PDF resume.';
      return;
    }

    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      resumeStatus.textContent =
        'Choose a non-empty PDF smaller than 5 MB.';
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      resumeStatus.textContent =
        'Only PDF resumes are allowed.';
      return;
    }

    resumeButton.disabled = true;
    resumeStatus.textContent = 'Uploading resume...';

    try {
      if (currentRole !== 'JOB_SEEKER') {
        throw new Error(
          'Only job seekers can upload resumes.'
        );
      }

      const token = await getAccessToken();

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `${API}/api/resumes/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.toString()}`,
            Accept: 'application/json'
          },
          body: formData
        }
      );

      const result = await response.json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
          `Upload failed (HTTP ${response.status}).`
        );
      }

      resumeStatus.textContent =
        'Resume uploaded successfully to private S3 storage!';

      resumeInput.value = '';

      // Refresh displayed resume metadata after upload.
      await loadMyResume();

    } catch (error) {
      console.error('Resume upload failed:', error);

      resumeStatus.textContent =
        `Resume upload failed: ${error.message}`;

    } finally {
      resumeButton.disabled = false;
    }
  });

  // ============================================
  // VIEW MY RESUME — PHASE 6
  // ============================================

  const viewResumeButton = document.createElement('button');
  viewResumeButton.type = 'button';
  viewResumeButton.className = 'btn ghost';
  viewResumeButton.textContent = 'View My Resume';
  viewResumeButton.style.marginLeft = '8px';

  const resumeDetails = document.createElement('p');
  resumeDetails.id = 'resume-details';
  resumeDetails.setAttribute('role', 'status');
  resumeDetails.setAttribute('aria-live', 'polite');

  viewResumeButton.addEventListener('click', loadMyResume);

  // ============================================
  // OPEN RESUME PDF — PHASE 7
  // ============================================

  const openResumePdfButton = document.createElement('button');
  openResumePdfButton.type = 'button';
  openResumePdfButton.className = 'btn ghost';
  openResumePdfButton.textContent = 'Open Resume PDF';
  openResumePdfButton.style.marginLeft = '8px';

  openResumePdfButton.addEventListener(
    'click',
    openMyResumePdf
  );

  resumeSection.append(
    resumeHeading,
    resumeDescription,
    resumeInput,
    resumeButton,
    resumeStatus,
    viewResumeButton,
    openResumePdfButton,
    resumeDetails
  );

  // ============================================
  // MY APPLICATIONS
  // ============================================

  const heading = document.createElement('h2');
  heading.textContent = 'My Applications';

  const description = document.createElement('p');
  description.textContent =
    'Track the jobs you have applied for.';

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'btn ghost';
  refresh.textContent = 'Refresh Applications';

  refresh.addEventListener('click', loadMyApplications);

  const status = document.createElement('p');
  status.id = 'applications-status';
  status.setAttribute('role', 'status');

  const list = document.createElement('div');
  list.id = 'applications-list';

  dashboard.append(
    resumeSection,
    heading,
    description,
    refresh,
    status,
    list
  );

  $('screen-home').appendChild(dashboard);

  return dashboard;
}

// ============================================
// LOAD MY RESUME FROM POSTGRESQL — PHASE 6
// ============================================

async function loadMyResume() {
  if (currentRole !== 'JOB_SEEKER') return;

  const resumeDetails = $('resume-details');

  if (!resumeDetails) return;

  resumeDetails.textContent =
    'Loading resume information...';

  try {
    const resume = await authenticatedRequest(
      '/api/resumes/my'
    );

    const uploadedDate = new Date(
      resume.uploadedAt
    ).toLocaleString();

    resumeDetails.textContent =
      `Filename: ${resume.originalFilename} | ` +
      `Uploaded: ${uploadedDate}`;

  } catch (error) {
    console.error('Resume lookup failed:', error);

    if (/^HTTP 404\b/.test(error.message)) {
      resumeDetails.textContent =
        'No resume uploaded yet.';
    } else {
      resumeDetails.textContent =
        `Unable to load resume: ${error.message}`;
    }
  }
}

// ============================================
// OPEN MY RESUME PDF — PHASE 7
// ============================================

async function openMyResumePdf() {
  if (currentRole !== 'JOB_SEEKER') {
    alert('Only job seekers can view resumes.');
    return;
  }

  // Open a new tab immediately to avoid popup blocking.
  const pdfTab = window.open('', '_blank');

  if (!pdfTab) {
    alert('Please allow pop-ups to open your resume.');
    return;
  }

  try {
    const response = await authenticatedRequest(
      '/api/resumes/my/download-url'
    );

    if (!response.url) {
      throw new Error('No PDF viewing URL was returned.');
    }

    // Open the temporary S3 presigned URL.
    pdfTab.location.replace(response.url);

  } catch (error) {
    pdfTab.close();

    console.error('Unable to open resume PDF:', error);

    alert(
      error.message ||
      'Unable to open your resume PDF.'
    );
  }
}

// ============================================
// LOAD MY APPLICATIONS
// ============================================

async function loadMyApplications() {
  if (currentRole !== 'JOB_SEEKER') return;

  const status = $('applications-status');
  const container = $('applications-list');

  if (!status || !container) return;

  status.textContent = 'Loading applications...';

  try {
    const applications =
      await authenticatedRequest('/api/applications/my');

    if (!Array.isArray(applications)) {
      throw new Error(
        'Invalid applications response.'
      );
    }

    myApplications = applications;
    container.replaceChildren();

    status.textContent =
      `${applications.length} application(s)`;

    if (applications.length === 0) {
      container.textContent =
        'You have not applied for any jobs yet.';
    }

    applications.forEach(application => {
      const job = allJobs.find(
        item => Number(item.id) === Number(application.jobId)
      );

      const card = document.createElement('article');
      card.className = 'job-card';
      card.style.marginBottom = '12px';

      const title = document.createElement('h4');
      title.textContent = job
        ? job.title
        : `Job ID ${application.jobId}`;

      const company = document.createElement('p');
      company.textContent = job
        ? `Company: ${job.company}`
        : 'Job listing unavailable';

      const state = document.createElement('p');
      state.textContent =
        `Status: ${application.status}`;

      const date = document.createElement('p');
      date.textContent =
        `Applied: ${new Date(application.appliedAt).toLocaleString()}`;

      card.append(
        title,
        company,
        state,
        date
      );

      container.appendChild(card);
    });

    filterJobs();

  } catch (error) {
    console.error(error);

    status.textContent =
      `Unable to load applications: ${error.message}`;
  }
}

// ============================================
// END OF PART 2
// PART 3 STARTS WITH EMPLOYER DASHBOARD
// ============================================

// ============================================
// EMPLOYER DASHBOARD
// ============================================


function validateCompanyLogo(file) {
  if (!file) {
    throw new Error('Select a company logo.');
  }

  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Only PNG and JPEG images are allowed.');
  }

  if (file.size === 0 || file.size > 1024 * 1024) {
    throw new Error('Logo must be between 1 byte and 1 MB.');
  }
}

async function uploadCompanyLogo(jobId, file) {
  validateCompanyLogo(file);

  const token = await getAccessToken();
  const formData = new FormData();

  formData.append('file', file);

  const response = await fetch(
    `${API}/api/jobs/${jobId}/logo`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.toString()}`,
        Accept: 'application/json'
      },
      body: formData
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message ||
      `Logo upload failed (HTTP ${response.status}).`
    );
  }

  return result;
}

function displayCompanyLogo(card, job) {
  if (!job.logoKey) return;

  const image = document.createElement('img');

  image.alt = `${job.company || 'Company'} logo`;
  image.loading = 'lazy';

  image.src =
    `${API}/api/jobs/${job.id}/logo?v=${encodeURIComponent(job.logoKey)}`;

  Object.assign(image.style, {
    width: '72px',
    height: '72px',
    objectFit: 'contain',
    backgroundColor: '#ffffff',
    border: '1px solid #d5dce5',
    borderRadius: '10px',
    padding: '6px',
    marginBottom: '12px'
  });

  image.addEventListener('error', () => image.remove());

  card.prepend(image);
}

function addCompanyLogoControls(card, job) {
  const wrapper = document.createElement('div');
  wrapper.style.margin = '12px 0';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg';
  input.setAttribute('aria-label', 'Select company logo');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn ghost';

  button.textContent = job.logoKey
    ? 'Replace Logo'
    : 'Upload Logo';

  button.addEventListener('click', async () => {
    const status = $('employer-status');

    try {
      button.disabled = true;
      status.textContent = 'Uploading company logo...';

      await uploadCompanyLogo(job.id, input.files[0]);

      status.textContent = 'Company logo saved successfully.';

      await loadJobs();
      await loadEmployerJobs();

    } catch (error) {
      status.textContent = error.message;

    } finally {
      button.disabled = false;
    }
  });

  wrapper.append(input, button);
  card.appendChild(wrapper);
}

function createEmployerDashboard() {
  let dashboard = $('employer-dashboard');
  if (dashboard) return dashboard;

  dashboard = document.createElement('section');
  dashboard.id = 'employer-dashboard';
  dashboard.className = 'employer-dashboard';

  Object.assign(dashboard.style, {
    marginTop: '32px',
    padding: '24px',
    border: '1px solid #d5dce5',
    borderRadius: '14px'
  });

  dashboard.innerHTML = `
    <h2>Employer Dashboard</h2>
    <p>Post jobs and manage your company's listings.</p>

    <h3>Post a New Job</h3>

    <form id="employer-job-form">
      <label for="employer-title">Job Title</label>
      <input id="employer-title" required maxlength="150"
             placeholder="AWS Backend Developer"
             style="display:block;width:100%;padding:12px;margin-bottom:16px">

      <label for="employer-company">Company Name</label>
      <input id="employer-company" required maxlength="150"
             placeholder="JSolutions"
             style="display:block;width:100%;padding:12px;margin-bottom:16px">

      <label for="employer-location">Job Location</label>
      <input id="employer-location" required maxlength="150"
             placeholder="Toronto"
             style="display:block;width:100%;padding:12px;margin-bottom:16px">

      <label for="employer-logo">Company Logo (Optional)</label>
      <input id="employer-logo"
             type="file"
             accept="image/png,image/jpeg"
             style="display:block;width:100%;margin-bottom:8px">
      <p style="font-size:13px;margin-bottom:16px">
        PNG or JPEG, maximum 1 MB.
      </p>

      <button type="submit" class="btn">Post Job</button>
    </form>

    <p id="employer-status" role="status"></p>
    <hr style="margin:28px 0">
    <h3>My Job Postings</h3>
    <p id="employer-count"></p>
    <div id="employer-jobs"></div>
  `;

  $('screen-home').appendChild(dashboard);

  $('employer-job-form').addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const button =
        $('employer-job-form').querySelector(
          'button[type="submit"]'
        );

      const status = $('employer-status');

      const job = {
        title: $('employer-title').value.trim(),
        company: $('employer-company').value.trim(),
        location: $('employer-location').value.trim()
      };

      if (!job.title || !job.company || !job.location) {
        status.textContent = 'Complete all fields.';
        return;
      }

      try {
        button.disabled = true;
        const logoFile = $('employer-logo').files[0];

        if (logoFile) {
          validateCompanyLogo(logoFile);
        }

        status.textContent = 'Posting job...';

        const created = await authenticatedRequest(
          '/api/jobs', 'POST', job
        );

        let message = `Job posted successfully! ID: ${created.id}`;

        if (logoFile) {
          try {
            await uploadCompanyLogo(created.id, logoFile);
            message += ' Company logo uploaded.';
          } catch (error) {
            message += ' Logo upload failed: ' + error.message
              + ' Retry from My Job Postings.';
          }
        }

        status.textContent = message;

        $('employer-job-form').reset();

        await loadJobs();
        await loadEmployerJobs();

      } catch (error) {
        status.textContent = error.message;

      } finally {
        button.disabled = false;
      }
    }
  );

  return dashboard;
}

// ============================================
// LOAD EMPLOYER JOBS
// ============================================

async function loadEmployerJobs() {
  if (currentRole !== 'EMPLOYER') return;

  const container = $('employer-jobs');
  if (!container) return;

  container.textContent = 'Loading your jobs...';

  try {
    const jobs = await authenticatedRequest('/api/jobs');

    const mine = jobs.filter(
      job => String(job.employerId || '') === currentUserId
    );

    $('employer-count').textContent =
      `${mine.length} job posting(s)`;

    container.replaceChildren();

    if (!mine.length) {
      container.textContent =
        'You have not posted any jobs yet.';
      return;
    }

    for (const job of mine) {
      const card = document.createElement('article');
      card.className = 'job-card';
      card.style.marginBottom = '16px';

      const title = document.createElement('h4');
      title.textContent = job.title;

      const company = document.createElement('p');
      company.textContent = `Company: ${job.company}`;

      const location = document.createElement('p');
      location.textContent = `Location: ${job.location}`;

      displayCompanyLogo(card, job);
      addCompanyLogoControls(card, job);

      // ============================================
      // EDIT JOB
      // ============================================

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn ghost';
      edit.textContent = 'Edit Job';

      edit.addEventListener('click', async () => {
        const newTitle = prompt('Job title:', job.title);
        if (newTitle === null) return;

        const newCompany = prompt('Company:', job.company);
        if (newCompany === null) return;

        const newLocation = prompt('Location:', job.location);
        if (newLocation === null) return;

        const updated = {
          title: newTitle.trim(),
          company: newCompany.trim(),
          location: newLocation.trim()
        };

        if (
          !updated.title ||
          !updated.company ||
          !updated.location
        ) {
          $('employer-status').textContent =
            'All fields are required.';
          return;
        }

        try {
          edit.disabled = true;

          await authenticatedRequest(
            `/api/jobs/${job.id}`, 'PUT', updated
          );

          $('employer-status').textContent =
            'Job updated successfully.';

          await loadJobs();
          await loadEmployerJobs();

        } catch (error) {
          $('employer-status').textContent =
            error.message;

        } finally {
          edit.disabled = false;
        }
      });

      // ============================================
      // DELETE JOB
      // ============================================

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn ghost';
      remove.textContent = 'Delete Job';

      remove.addEventListener('click', async () => {
        if (!confirm(`Delete "${job.title}"?`)) return;

        try {
          remove.disabled = true;

          await authenticatedRequest(
            `/api/jobs/${job.id}`, 'DELETE'
          );

          $('employer-status').textContent =
            'Job deleted successfully.';

          await loadJobs();
          await loadEmployerJobs();

        } catch (error) {
          $('employer-status').textContent =
            error.message;

        } finally {
          remove.disabled = false;
        }
      });

      // ============================================
      // VIEW APPLICANTS
      // ============================================

      const applicants = document.createElement('button');
      applicants.type = 'button';
      applicants.className = 'btn ghost';
      applicants.textContent = 'View Applicants';

      const applicantsList = document.createElement('div');

      applicants.addEventListener('click', async () => {
        applicants.disabled = true;
        applicantsList.textContent = 'Loading applicants...';

        try {
          const applications = await authenticatedRequest(
            `/api/applications/job/${job.id}`
          );

          if (!Array.isArray(applications)) {
            throw new Error('Invalid applicants response.');
          }

          applicantsList.replaceChildren();

          if (!applications.length) {
            applicantsList.textContent =
              'No applications received yet.';
          }

          applications.forEach(application => {
            const entry = document.createElement('p');

            entry.textContent =
              `Applicant ID: ${application.applicantId} | ` +
              `Status: ${application.status} | ` +
              `Applied: ${new Date(application.appliedAt).toLocaleString()}`;

            applicantsList.appendChild(entry);

            // ============================================
            // PHASE 8: VIEW APPLICANT RESUME
            // ============================================

            const viewResume = document.createElement('button');
            viewResume.type = 'button';
            viewResume.className = 'btn ghost';
            viewResume.textContent = 'View Applicant Resume';
            viewResume.style.marginBottom = '12px';

            viewResume.addEventListener('click', async () => {
              const pdfTab = window.open('', '_blank');

              if (!pdfTab) {
                alert('Please allow pop-ups to view resumes.');
                return;
              }

              viewResume.disabled = true;

              try {
                const applicantId = application.applicantId;

                if (!applicantId) {
                  throw new Error('Applicant ID is missing.');
                }

                const result = await authenticatedRequest(
                  `/api/jobs/${encodeURIComponent(job.id)}` +
                  `/applicants/${encodeURIComponent(applicantId)}/resume-url`
                );

                if (typeof result?.url !== 'string') {
                  throw new Error('No resume URL was returned.');
                }

                const url = new URL(result.url);

                if (url.protocol !== 'https:') {
                  throw new Error('Invalid resume URL.');
                }

                pdfTab.opener = null;
                pdfTab.location.replace(url.href);

              } catch (error) {
                pdfTab.close();

                console.error(
                  'Applicant resume error:',
                  error
                );

                alert(
                  `Unable to open applicant resume: ${error.message}`
                );

              } finally {
                viewResume.disabled = false;
              }
            });

            applicantsList.appendChild(viewResume);
          });

        } catch (error) {
          applicantsList.textContent = error.message;

        } finally {
          applicants.disabled = false;
        }
      });

      card.append(
        title,
        company,
        location,
        edit,
        remove,
        applicants,
        applicantsList
      );

      container.appendChild(card);
    }

  } catch (error) {
    console.error(error);
    container.textContent = error.message;
  }
}

// ============================================
// END OF PART 3
// PART 4 STARTS WITH ROLE-BASED DASHBOARD
// ============================================

// ============================================
// ROLE-BASED DASHBOARD
// ============================================

function hideOldCrudTest() {
  const button = $('test-crud');

  if (!button) return;

  const section = button.closest('section');

  if (section && section.id !== 'screen-home') {
    section.hidden = true;
    section.style.display = 'none';
  } else {
    button.hidden = true;
    button.style.display = 'none';

    const result = $('crud-results');
    if (result) result.hidden = true;
  }
}

async function initializeRoleDashboard() {
  const role = await detectUserRole();

  hideOldCrudTest();

  const employer = $('employer-dashboard');
  const seeker = $('jobseeker-dashboard');

  if (employer) employer.hidden = true;
  if (seeker) seeker.hidden = true;

  if (role === 'EMPLOYER') {
    createEmployerDashboard().hidden = false;
    await loadEmployerJobs();
  }

  if (role === 'JOB_SEEKER') {
    createJobSeekerDashboard().hidden = false;
    await loadMyApplications();
  }

  filterJobs();
}

// ============================================
// VERIFY COGNITO SESSION
// ============================================

async function checkCognitoSession() {
  try {
    const token = await getAccessToken();

    console.log('Cognito access token available: YES');

    const response = await fetch(`${API}/api/me`, {
      headers: {
        Authorization: `Bearer ${token.toString()}`
      }
    });

    console.log('Protected API status:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('JWT authentication:', data.message);
    }

  } catch (error) {
    console.error('Session check failed:', error);
  }
}

// ============================================
// HOME
// ============================================

async function showHome() {
  const user = await getCurrentUser();

  const who =
    user.signInDetails?.loginId || user.username;

  $('who').textContent = who;
  $('avatar').textContent = who.charAt(0).toUpperCase();

  show('home');

  await detectUserRole();

  await loadJobs();
  void checkCognitoSession();

  try {
    await initializeRoleDashboard();

  } catch (error) {
    console.error(error);

    say(
      'Unable to load dashboard: ' + error.message,
      true
    );
  }
}

// ============================================
// PHASE 9 — ROLE-BASED SIGNUP
// ============================================

$('screen-signup').addEventListener('submit', async event => {
  event.preventDefault();

  const email = $('su-email').value.trim();
  const password = $('su-password').value;

  const selectedRole = document.querySelector(
    'input[name="account-type"]:checked'
  )?.value;

  const companyName = $('su-company')?.value.trim() || '';

  if (!['JOB_SEEKER', 'EMPLOYER'].includes(selectedRole)) {
    say('Please select Job Seeker or Employer.', true);
    return;
  }

  if (selectedRole === 'EMPLOYER' && !companyName) {
    say('Please enter your company name.', true);
    return;
  }

  const userAttributes = {
    email,
    'custom:requested_role': selectedRole
  };

  if (selectedRole === 'EMPLOYER') {
    userAttributes['custom:company_name'] = companyName;
  }

  const submitButton = $('screen-signup').querySelector(
    'button[type="submit"]'
  );

  try {
    if (submitButton) submitButton.disabled = true;

    const result = await signUp({
      username: email,
      password,
      options: {
        userAttributes
      }
    });

    pendingEmail = email;

    if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
      show('verify');
      say('Verification code sent to ' + email);
    } else {
      show('login');
      say('Account created. Please sign in.');
    }

  } catch (error) {
    fail(error);

  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// ============================================
// TEMPORARY PHASE 8 SECURITY TEST
// ============================================

window.testJobSeekerResumeAccess = async function () {
  try {
    const token = await getAccessToken();

    const jobsResponse = await fetch(`${API}/api/jobs`);

    if (!jobsResponse.ok) {
      throw new Error(
        `Jobs API returned ${jobsResponse.status}`
      );
    }

    const jobs = await jobsResponse.json();

    const job = jobs.find(
      item => item.title === 'SR. AWS Backend Developer'
    );

    if (!job) {
      console.log('Test job not found.');
      return;
    }

    const response = await fetch(
      `${API}/api/jobs/${job.id}` +
      '/applicants/210b45e0-f031-7065-7d0b-671aaecba0a3/resume-url',
      {
        headers: {
          Authorization: `Bearer ${token.toString()}`
        }
      }
    );

    console.log(
      'Job seeker resume access HTTP status:',
      response.status
    );

  } catch (error) {
    console.error('Security test failed:', error);
  }
};

// ============================================
// VERIFY EMAIL
// ============================================

$('screen-verify').addEventListener('submit', async event => {
  event.preventDefault();

  try {
    await confirmSignUp({
      username: pendingEmail,
      confirmationCode: $('vf-code').value.trim()
    });

    show('login');
    say('Email verified. Please sign in.');

  } catch (error) {
    fail(error);
  }
});

$('resend').addEventListener('click', async event => {
  event.preventDefault();

  try {
    await resendSignUpCode({
      username: pendingEmail
    });

    say('New verification code sent.');

  } catch (error) {
    fail(error);
  }
});

// ============================================
// SIGN-IN CHALLENGES
// ============================================

async function handleStep(output) {
  const step = output.nextStep.signInStep;

  switch (step) {
    case 'DONE':
      await showHome();
      return;

    case 'CONFIRM_SIGN_UP':
      await resendSignUpCode({
        username: pendingEmail
      });

      show('verify');
      say('Verify your email first.');
      return;

    case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP': {
      const details = output.nextStep.totpSetupDetails;

      const uri = details.getSetupUri(
        'JSolutions',
        pendingEmail
      ).toString();

      $('qr').src = await QRCode.toDataURL(uri);
      $('secret').textContent = details.sharedSecret;

      show('otp');
      $('qr-box').hidden = false;

      say('Scan the QR code and enter the 6-digit code.');
      return;
    }

    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      show('otp');
      $('qr-box').hidden = true;
      say('Enter your authenticator code.');
      return;

    case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
    case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
      show('otp');
      $('qr-box').hidden = true;
      say('Enter the verification code sent to you.');
      return;

    default:
      say('Unsupported sign-in step: ' + step, true);
  }
}

// ============================================
// LOGIN
// ============================================

$('screen-login').addEventListener('submit', async event => {
  event.preventDefault();

  pendingEmail = $('li-email').value.trim();

  try {
    const result = await signIn({
      username: pendingEmail,
      password: $('li-password').value
    });

    await handleStep(result);

  } catch (error) {
    if (error.name === 'UserAlreadyAuthenticatedException') {
      await showHome();
    } else {
      fail(error);
    }
  }
});

// ============================================
// MFA
// ============================================

$('screen-otp').addEventListener('submit', async event => {
  event.preventDefault();

  try {
    const result = await confirmSignIn({
      challengeResponse: $('otp-code').value.trim()
    });

    $('otp-code').value = '';

    await handleStep(result);

  } catch (error) {
    fail(error);
  }
});

// ============================================
// PASSWORD RESET
// ============================================

$('screen-forgot').addEventListener('submit', async event => {
  event.preventDefault();

  const email = $('fp-email').value.trim();

  try {
    const result = await resetPassword({
      username: email
    });

    pendingEmail = email;

    if (
      result.nextStep.resetPasswordStep ===
      'CONFIRM_RESET_PASSWORD_WITH_CODE'
    ) {
      show('reset');
      say('Password reset code sent to ' + email);
    }

  } catch (error) {
    fail(error);
  }
});

$('screen-reset').addEventListener('submit', async event => {
  event.preventDefault();

  try {
    await confirmResetPassword({
      username: pendingEmail,
      confirmationCode: $('rp-code').value.trim(),
      newPassword: $('rp-password').value
    });

    show('login');
    say('Password changed. Please sign in.');

  } catch (error) {
    fail(error);
  }
});

// ============================================
// CHANGE PASSWORD
// ============================================

$('change-pw').addEventListener('submit', async event => {
  event.preventDefault();

  try {
    await updatePassword({
      oldPassword: $('cp-old').value,
      newPassword: $('cp-new').value
    });

    $('change-pw').reset();
    say('Password updated.');

  } catch (error) {
    fail(error);
  }
});

// ============================================
// ACCOUNT SETTINGS
// ============================================

$('open-settings')?.addEventListener('click', () => {
  show('settings');
});

$('back-to-jobs')?.addEventListener('click', () => {
  show('home');
});

// ============================================
// LOGOUT
// ============================================

$('logout').addEventListener('click', async () => {
  try {
    await signOut();

    jobsRequestId++;
    allJobs = [];
    myApplications = [];
    currentRole = null;
    currentUserId = null;

    $('jobs-list').replaceChildren();

    $('jobs-status').textContent =
      'Job listings will appear here.';

    if ($('employer-dashboard')) {
      $('employer-dashboard').hidden = true;
    }

    if ($('jobseeker-dashboard')) {
      $('jobseeker-dashboard').hidden = true;
    }

    show('login');

  } catch (error) {
    fail(error);
  }
});

// ============================================
// PASSWORD SHOW / HIDE
// ============================================

document.addEventListener('click', event => {
  const button = event.target.closest('[data-reveal]');

  if (!button) return;

  const input = $(button.dataset.reveal);

  if (!input) return;

  const visible = input.type === 'text';

  input.type = visible ? 'password' : 'text';

  button.textContent = visible ? 'Show' : 'Hide';

  button.setAttribute(
    'aria-label',
    visible ? 'Show password' : 'Hide password'
  );
});

// ============================================
// APPLICATION STARTUP
// ============================================

(async () => {
  try {
    await getCurrentUser();
    await showHome();

  } catch (error) {
    console.log('Sign-in required:', error.message);
    show('login');
  }
})();

// ============================================
// PHASE 9 — REGISTRATION FORM BEHAVIOR
// ============================================

const accountTypeOptions =
  document.querySelectorAll('input[name="account-type"]');

const companyField = document.getElementById('su-company-field');
const companyInput = document.getElementById('su-company');

function updateSignupAccountType() {
  const selected = document.querySelector(
    'input[name="account-type"]:checked'
  );

  const isEmployer = selected?.value === 'EMPLOYER';

  companyField.hidden = !isEmployer;
  companyInput.required = isEmployer;

  if (!isEmployer) {
    companyInput.value = '';
  }
}

accountTypeOptions.forEach(option => {
  option.addEventListener('change', updateSignupAccountType);
});

updateSignupAccountType();

// ============================================
// END OF JSOLUTIONS APP.JS — PHASE 9
// ============================================

