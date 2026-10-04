import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUsers, getMyBookings, createUserRating } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Search, Star, Building2, SlidersHorizontal, X, ChevronDown } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name_az', label: 'Name A → Z' },
  { value: 'name_za', label: 'Name Z → A' },
  { value: 'rating_high', label: 'Rating: High → Low' },
  { value: 'rating_low', label: 'Rating: Low → High' },
];

const ownerRating = (o) => {
  const n = Number(o?.avgRatingOwner);
  return Number.isFinite(n) ? n : 0;
};

const Owners = () => {
  const { user: currentUser } = useAuth();
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eligibleOwnerIds, setEligibleOwnerIds] = useState(() => new Set());

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [minRating, setMinRating] = useState(0);

  // Rating modal
  const [rateModal, setRateModal] = useState({ open: false, target: null });
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await getUsers({ role: 'owner' });
        setOwners(res.data.users || []);
      } catch (e) {
        setError('Failed to fetch owners');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadEligible = async () => {
      try {
        if (!currentUser || currentUser.role !== 'tenant') return;
        const res = await getMyBookings({ status: 'approved', limit: 100 });
        const ids = new Set();
        (res.data.bookings || []).forEach(b => {
          if (b.property?.owner) ids.add(b.property.owner._id || b.property.owner);
        });
        setEligibleOwnerIds(ids);
      } catch { /* silent */ }
    };
    loadEligible();
  }, [currentUser]);

  const canRate = useMemo(() => currentUser?.role === 'tenant', [currentUser]);

  // ── Client-side filter + sort ────────────────────────────────────────────
  const filteredOwners = useMemo(() => {
    let list = [...owners];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(o =>
        (o.name || '').toLowerCase().includes(q) ||
        (o.email || '').toLowerCase().includes(q)
      );
    }
    if (minRating > 0) {
      list = list.filter(o => ownerRating(o) >= minRating);
    }
    switch (sortBy) {
      case 'name_az': list.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      case 'name_za': list.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break;
      case 'rating_high': list.sort((a, b) => ownerRating(b) - ownerRating(a)); break;
      case 'rating_low': list.sort((a, b) => ownerRating(a) - ownerRating(b)); break;
      case 'oldest': list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
      default: list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return list;
  }, [owners, searchQuery, sortBy, minRating]);

  const openRate = (owner) => { setRateModal({ open: true, target: owner }); setRatingValue(5); setRatingComment(''); };
  const submitRating = async () => {
    if (!rateModal.target) return;
    const rating = Number(ratingValue);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      alert('Rating must be a whole number between 1 and 5');
      return;
    }
    try {
      setSubmitting(true);
      await createUserRating({ rateeId: rateModal.target._id, rating, comment: ratingComment, context: 'owner' });
      setRateModal({ open: false, target: null });
    } catch (e) { alert(e.message || 'Failed to submit rating'); }
    finally { setSubmitting(false); }
  };

  const selectedSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Sort';

  return (
    <>
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* ── Header ── */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">Property Owners</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {loading ? 'Loading…' : `${filteredOwners.length} owner${filteredOwners.length !== 1 ? 's' : ''} found`}
            </p>
          </div>

          {/* ── Search + Filter bar ── */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-500 text-sm transition-shadow"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Min Rating filter */}
            <div className="relative">
              <select
                value={minRating}
                onChange={e => setMinRating(Number(e.target.value))}
                className="h-11 pl-4 pr-8 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-cyan-500 appearance-none cursor-pointer"
              >
                <option value={0}>Any Rating</option>
                <option value={1}>★ 1+</option>
                <option value={2}>★ 2+</option>
                <option value={3}>★ 3+</option>
                <option value={4}>★ 4+</option>
                <option value={4.5}>★ 4.5+</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setSortOpen(p => !p)}
                className="h-11 flex items-center gap-2 px-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-hidden focus:ring-2 focus:ring-cyan-500 transition-colors whitespace-nowrap"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {selectedSortLabel}
                <ChevronDown className={`w-4 h-4 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl z-20 overflow-hidden">
                  {SORT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${sortBy === opt.value ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 font-medium' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Error ── */}
          {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">{error}</div>}

          {/* ── Content ── */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm p-6 animate-pulse">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded-sm w-3/4" />
                      <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded-sm w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredOwners.length === 0 ? (
            <div className="text-center py-20">
              <Search className="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-4" />
              <p className="text-lg font-medium text-neutral-500 dark:text-neutral-400">No owners match your search</p>
              <button onClick={() => { setSearchQuery(''); setMinRating(0); setSortBy('newest'); }}
                className="mt-4 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOwners.map((o) => (
                <div key={o._id} className="group bg-white dark:bg-neutral-800 rounded-2xl shadow-sm hover:shadow-lg transition-shadow p-6 flex flex-col">
                  <div className="flex items-center gap-4 mb-4">
                    {o.profileImage ? (
                      <img src={o.profileImage} alt={o.name || 'Owner'} className="w-14 h-14 rounded-full object-cover ring-2 ring-neutral-100 dark:ring-neutral-700" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
                        {(o.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-neutral-900 dark:text-white truncate">{o.name}</h3>
                      {o.email && <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">{o.email}</p>}
                      <div className="flex items-center gap-1 mt-1">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          {ownerRating(o).toFixed(1)}
                        </span>
                        <span className="text-xs text-neutral-400">({Number(o.ratingCountOwner) || 0} reviews)</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-neutral-100 dark:border-neutral-700">
                    <Link to={`/users/${o._id}`}
                      className="flex-1 text-center rounded-lg border border-neutral-200 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 py-2 px-3 text-sm font-medium transition-colors">
                      View Profile
                    </Link>
                    <Link to={`/owners/${o._id}/properties`}
                      className="flex-1 text-center rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-3 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> Properties
                    </Link>
                    {canRate && eligibleOwnerIds.has(o._id) && (
                      <button onClick={() => openRate(o)}
                        className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white py-2 px-3 text-sm font-medium transition-colors">
                        Rate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Rating Modal ── */}
      {rateModal.open && rateModal.target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setRateModal({ open: false, target: null })}>
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">Rate {rateModal.target.name}</h3>
            <label className="block text-sm text-neutral-700 dark:text-neutral-300 mb-2">Rating (1–5)</label>
            <select value={ratingValue} onChange={e => setRatingValue(Number(e.target.value))}
              className="w-full mb-4 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-transparent px-3 py-2 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-500">
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n} className="text-neutral-900">{n} ★</option>)}
            </select>
            <label className="block text-sm text-neutral-700 dark:text-neutral-300 mb-2">Comment (optional)</label>
            <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} rows={3}
              className="w-full mb-4 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-transparent px-3 py-2 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-500" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRateModal({ open: false, target: null })} disabled={submitting}
                className="rounded-lg border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 py-2 px-4 text-sm transition-colors">
                Cancel
              </button>
              <button onClick={submitRating} disabled={submitting}
                className="rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-4 text-sm font-medium transition-colors">
                {submitting ? 'Submitting…' : 'Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Owners;
