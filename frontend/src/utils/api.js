const API_BASE_URL = '/api';

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `${response.status} ${response.statusText}` }));
    throw new Error(error.message || `${response.status} ${response.statusText}`);
  }
  return response.json();
};

// ─── OTP / Auth ───────────────────────────────────────────────────────────────

export const sendOtp = async (email, purpose) => {
  const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ email, purpose }),
  });
  return handleResponse(response);
};

export const verifyOtp = async (email, otp, purpose) => {
  const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ email, otp, purpose }),
  });
  return handleResponse(response);
};

export const verify2FA = async (tempToken, otp) => {
  const response = await fetch(`${API_BASE_URL}/auth/verify-2fa`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ tempToken, otp }),
  });
  return handleResponse(response);
};

export const refreshToken = async () => {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
  return handleResponse(response);
};

export const forgotPassword = async (email) => {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleResponse(response);
};

export const resetPassword = async (email, otp, newPassword) => {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, newPassword }),
  });
  return handleResponse(response);
};

// ─── User Security ────────────────────────────────────────────────────────────

export const apiChangeEmail = async (password, newEmail) => {
  const response = await fetch(`${API_BASE_URL}/users/change-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ password, newEmail }),
  });
  return handleResponse(response);
};

export const apiConfirmEmailChange = async (newEmail, otp) => {
  const response = await fetch(`${API_BASE_URL}/users/confirm-email-change`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ newEmail, otp }),
  });
  return handleResponse(response);
};

export const apiToggle2FA = async (password, enabled) => {
  const response = await fetch(`${API_BASE_URL}/users/toggle-2fa`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ password, enabled }),
  });
  return handleResponse(response);
};

export const apiChangePassword = async (currentPassword, newPassword) => {
  const response = await fetch(`${API_BASE_URL}/users/change-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handleResponse(response);
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = async (email, password) => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(response);
};

export const register = async (userData) => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(userData),
  });
  return handleResponse(response);
};

export const logout = async () => {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  return handleResponse(response);
};

export const getCurrentUser = async () => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' });
  return handleResponse(response);
};

export const updateProfile = async (userId, profileData) => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(profileData),
  });
  return handleResponse(response);
};

export const deleteCurrentUser = async (password) => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { 
    method: 'DELETE', 
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password })
  });
  return handleResponse(response);
};

// ─── Properties ───────────────────────────────────────────────────────────────

export const getProperties = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/properties?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getProperty = async (id) => {
  const response = await fetch(`${API_BASE_URL}/properties/${id}`, { credentials: 'include' });
  return handleResponse(response);
};

export const createProperty = async (data) => {
  const response = await fetch(`${API_BASE_URL}/properties`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateProperty = async (id, data) => {
  const response = await fetch(`${API_BASE_URL}/properties/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteProperty = async (id) => {
  const response = await fetch(`${API_BASE_URL}/properties/${id}`, { method: 'DELETE', credentials: 'include' });
  return handleResponse(response);
};

export const getPropertiesByOwner = async (ownerId) => {
  const response = await fetch(`${API_BASE_URL}/properties/owner/${ownerId}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getTopRatedProperties = async (params = {}) => {
  const sp = new URLSearchParams();
  if (params.limit) sp.append('limit', params.limit);
  const response = await fetch(`${API_BASE_URL}/properties/top-rated?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const searchProperties = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/properties?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getSuggestedProperties = (params = {}) => searchProperties(params);

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const getBookings = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/bookings?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getMyBookings = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/bookings/my?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const createBooking = async (data) => {
  const response = await fetch(`${API_BASE_URL}/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateBooking = async (id, data) => {
  const response = await fetch(`${API_BASE_URL}/bookings/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateBookingStatus = async (id, status) => {
  const response = await fetch(`${API_BASE_URL}/bookings/${id}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ status }),
  });
  return handleResponse(response);
};

export const deleteBooking = async (id) => {
  const response = await fetch(`${API_BASE_URL}/bookings/${id}`, { method: 'DELETE', credentials: 'include' });
  return handleResponse(response);
};

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const getReviews = async (propertyId) => {
  const response = await fetch(`${API_BASE_URL}/reviews?property=${propertyId}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getPropertyReviews = (propertyId) => getReviews(propertyId);

export const getMyReviews = async () => {
  const response = await fetch(`${API_BASE_URL}/reviews/my`, { credentials: 'include' });
  return handleResponse(response);
};

export const getMyPropertiesReviews = async () => {
  const response = await fetch(`${API_BASE_URL}/reviews/my-properties`, { credentials: 'include' });
  return handleResponse(response);
};

export const createReview = async (data) => {
  const response = await fetch(`${API_BASE_URL}/reviews`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteReview = async (id) => {
  const response = await fetch(`${API_BASE_URL}/reviews/${id}`, { method: 'DELETE', credentials: 'include' });
  return handleResponse(response);
};

export const canReviewProperty = async (propertyId) => {
  const response = await fetch(`${API_BASE_URL}/reviews/can-review/${propertyId}`, { credentials: 'include' });
  return handleResponse(response);
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const getUsers = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/users?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getUser = async (id) => {
  const response = await fetch(`${API_BASE_URL}/users/${id}`, { credentials: 'include' });
  return handleResponse(response);
};

export const updateUserStatus = async (id, status) => {
  const response = await fetch(`${API_BASE_URL}/users/${id}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ isActive: status }),
  });
  return handleResponse(response);
};

export const deleteUser = async (id) => {
  const response = await fetch(`${API_BASE_URL}/users/${id}`, { method: 'DELETE', credentials: 'include' });
  return handleResponse(response);
};

export const searchUsers = async (query) => {
  const response = await fetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
  return handleResponse(response);
};

export const canViewTenantContact = async (userId) => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/can-view-contact`, { credentials: 'include' });
  return handleResponse(response);
};

// ─── Favourites ───────────────────────────────────────────────────────────────

export const getMyFavourites = async () => {
  const response = await fetch(`${API_BASE_URL}/users/me/favourites`, { credentials: 'include' });
  return handleResponse(response);
};

export const getFavourites = () => getMyFavourites();

export const addFavourite = async (itemId, itemType) => {
  const response = await fetch(`${API_BASE_URL}/users/me/favourites`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ itemId, itemType }),
  });
  return handleResponse(response);
};

export const removeFavourite = async (itemId, itemType) => {
  const response = await fetch(`${API_BASE_URL}/users/me/favourites/${itemType}/${itemId}`, {
    method: 'DELETE', credentials: 'include',
  });
  return handleResponse(response);
};

// ─── Ratings ──────────────────────────────────────────────────────────────────

export const getUserRatings = async (userId) => {
  const response = await fetch(`${API_BASE_URL}/ratings/user/${userId}`, { credentials: 'include' });
  return handleResponse(response);
};

export const listUserRatings = (userId) => getUserRatings(userId);

export const getUserRatingSummary = async (userId) => {
  const response = await fetch(`${API_BASE_URL}/ratings/user/${userId}/summary`, { credentials: 'include' });
  return handleResponse(response);
};

export const createRating = async (data) => {
  const response = await fetch(`${API_BASE_URL}/ratings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const createUserRating = (data) => createRating(data);

export const canRateUser = async (userId) => {
  const response = await fetch(`${API_BASE_URL}/ratings/can-rate/${userId}`, { credentials: 'include' });
  return handleResponse(response);
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const getNotifications = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const qs = sp.toString() ? `?${sp}` : '';
  const response = await fetch(`${API_BASE_URL}/notifications/my${qs}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getMyNotifications = (params) => getNotifications(params);

export const markNotificationRead = async (id) => {
  const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, { method: 'PUT', credentials: 'include' });
  return handleResponse(response);
};

export const markNotificationUnread = async (id) => {
  const response = await fetch(`${API_BASE_URL}/notifications/${id}/unread`, { method: 'PUT', credentials: 'include' });
  return handleResponse(response);
};

export const markAllNotificationsRead = async () => {
  const response = await fetch(`${API_BASE_URL}/notifications/read-all`, { method: 'PUT', credentials: 'include' });
  return handleResponse(response);
};

export const markAllNotificationsUnread = async () => {
  const response = await fetch(`${API_BASE_URL}/notifications/unread-all`, { method: 'PUT', credentials: 'include' });
  return handleResponse(response);
};

export const deleteNotification = async (id) => {
  const response = await fetch(`${API_BASE_URL}/notifications/${id}`, { method: 'DELETE', credentials: 'include' });
  return handleResponse(response);
};

// ─── Leave Requests ───────────────────────────────────────────────────────────

export const getLeaveRequests = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/leave-requests?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const listMyLeaveRequests = (params = {}) => getLeaveRequests(params);

export const createLeaveRequest = async (data) => {
  const response = await fetch(`${API_BASE_URL}/leave-requests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateLeaveRequest = async (id, data) => {
  const response = await fetch(`${API_BASE_URL}/leave-requests/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const decideLeaveRequest = async (id, decision) => {
  const response = await fetch(`${API_BASE_URL}/leave-requests/${id}/decide`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ decision }),
  });
  return handleResponse(response);
};

// ─── Admin APIs ───────────────────────────────────────────────────────────────

export const getAdminStats = async () => {
  const response = await fetch(`${API_BASE_URL}/admin/stats`, { credentials: 'include' });
  return handleResponse(response);
};

export const getOwners = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/admin/owners?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getTenants = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/admin/tenants?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getAdminProperties = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/admin/properties?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const getAdminReviews = async (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.append(k, v); });
  const response = await fetch(`${API_BASE_URL}/admin/reviews?${sp}`, { credentials: 'include' });
  return handleResponse(response);
};

export const deleteUserById = async (id) => {
  const response = await fetch(`${API_BASE_URL}/users/${id}`, { method: 'DELETE', credentials: 'include' });
  return handleResponse(response);
};

export const deletePropertyById = async (id) => {
  const response = await fetch(`${API_BASE_URL}/properties/${id}`, { method: 'DELETE', credentials: 'include' });
  return handleResponse(response);
};

export const deleteReviewById = async (id, type) => {
  const endpoint = type === 'property'
    ? `${API_BASE_URL}/reviews/${id}`
    : `${API_BASE_URL}/ratings/${id}`;
  const response = await fetch(endpoint, { method: 'DELETE', credentials: 'include' });
  return handleResponse(response);
};

// Chat API functions
export const getMyConversations = async () => {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    credentials: 'include'
  });
  return handleResponse(response);
};

export const createConversation = async ({ participantIds, propertyId }) => {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ participantIds, propertyId })
  });
  return handleResponse(response);
};

export const getConversationMessages = async (conversationId) => {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}/messages`, {
    credentials: 'include'
  });
  return handleResponse(response);
};

export const sendChatMessage = async (conversationId, text) => {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ text })
  });
  return handleResponse(response);
};

export const markConversationRead = async (conversationId) => {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}/read`, {
    method: 'PATCH',
    credentials: 'include'
  });
  return handleResponse(response);
};
