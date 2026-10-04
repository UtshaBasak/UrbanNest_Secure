import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { getProperty, updateProperty } from '../utils/api';


const EditProperty = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    latitude: '',
    longitude: '',
    price: '',
    type: 'Apartment',
    availabilityStatus: 'Available'
  });
  const [saving, setSaving] = useState(false);
  const handleOpenMapInNewTab = () => {
    window.open('/map', '_blank');
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLoaded(false);
        setLoadError('');
        const res = await getProperty(id);
        const p = res.data?.property;
        if (!p) throw new Error('Property not found');
        setForm({
          title: p.title || '',
          description: p.description || '',
          location: p.location || '',
          latitude: p.latitude != null && p.latitude !== '' ? String(p.latitude) : '',
          longitude: p.longitude != null && p.longitude !== '' ? String(p.longitude) : '',
          price: p.price != null ? String(p.price) : '',
          type: p.type || 'Apartment',
          availabilityStatus: p.availabilityStatus || p.availability || 'Available',
        });
        setLoaded(true);
      } catch (e) {
        setLoadError(e.status === 404 ? 'Property not found' : 'Failed to load property');
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };



  // Parse an optional coordinate; returns undefined when empty, NaN when invalid
  const parseCoord = (value, min, max) => {
    if (value === '' || value == null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loaded) return;
    const price = Number(form.price);
    if (form.price === '' || !Number.isFinite(price) || price <= 0) {
      setError('Please enter a valid price greater than 0');
      return;
    }
    const latitude = parseCoord(form.latitude, -90, 90);
    const longitude = parseCoord(form.longitude, -180, 180);
    if (Number.isNaN(latitude)) {
      setError('Latitude must be a number between -90 and 90');
      return;
    }
    if (Number.isNaN(longitude)) {
      setError('Longitude must be a number between -180 and 180');
      return;
    }
    setError('');
    try {
      setSaving(true);
      await updateProperty(id, {
        title: form.title,
        description: form.description,
        location: form.location,
        latitude,
        longitude,
        price,
        type: form.type,
        availabilityStatus: form.availabilityStatus,
      });
      navigate(`/properties/${id}`);
    } catch (e) {
      setError(e.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto p-6">Loading...</div>;
  }

  if (loadError || !loaded) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-6">Edit Property</h1>
          <div className="mb-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-sm">
            {loadError || 'Failed to load property'}
          </div>
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center justify-center rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 py-2 px-4 font-medium">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-6">Edit Property</h1>
        {error && (
          <div className="mb-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-neutral-800 p-6 rounded-lg shadow-sm">
          <div>
            <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Title</label>
            <input name="title" value={form.title} onChange={handleChange} className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
          </div>
          <div>
            <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={4} className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
          </div>
          <div>
            <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Location</label>
            <input name="location" value={form.location} onChange={handleChange} className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Latitude</label>
              <input type="number" step="any" min={-90} max={90} name="latitude" value={form.latitude} onChange={handleChange} placeholder="e.g., 23.8103" className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
            </div>
            <div>
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Longitude</label>
              <input type="number" step="any" min={-180} max={180} name="longitude" value={form.longitude} onChange={handleChange} placeholder="e.g., 90.4125" className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Price (monthly)</label>
            <input type="number" min={0} step="any" required name="price" value={form.price} onChange={handleChange} className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
          </div>
          <div>
            <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Type</label>
            <select name="type" value={form.type} onChange={handleChange} className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600">
              <option>Apartment</option>
              <option>House</option>
              <option>Shop</option>
              <option>Commercial Space</option>
              <option>Land</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Status</label>
            <select name="availabilityStatus" value={form.availabilityStatus} onChange={handleChange} className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600">
              <option>Available</option>
              <option>Booked</option>
              <option>Under Construction</option>
              <option>Pre-booking Available</option>
            </select>
          </div>
          <div className="pt-2">
            <button type="submit" disabled={saving || !loaded} className="inline-flex items-center justify-center rounded-md bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-4 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProperty;
