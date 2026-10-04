import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createProperty } from '../utils/api';


const defaultForm = {
  title: '',
  description: '',
  price: '',
  location: '',
  latitude: '',
  longitude: '',
  size: '',
  bedrooms: 0,
  bathrooms: 0,
  type: 'Apartment',
  images: '', // comma-separated URLs for simplicity
  availabilityStatus: 'Available'
};

const MAX_IMAGES = 8;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB per source file
const MAX_IMAGE_DIMENSION = 1600; // px on the long side
const JPEG_QUALITY = 0.8;

// Load a File into an <img>, downscale it on a canvas and return a JPEG data URL
const downscaleImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      const longSide = Math.max(img.naturalWidth, img.naturalHeight) || 1;
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / longSide);
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      // JPEG has no alpha channel; paint a white background first
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    } catch (err) {
      reject(err);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error(`Could not read image "${file.name}"`));
  };
  img.src = url;
});

// Returns undefined when empty, NaN when invalid / out of range
const parseCoord = (value, min, max) => {
  if (value === '' || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
};

const CreateProperty = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedPreviews, setUploadedPreviews] = useState([]);
  const handleOpenMapInNewTab = () => {
    window.open('/map', '_blank');
  };


  const isAllowed = user && (user.role === 'owner' || user.role === 'admin');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumber = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value === '' ? '' : Number(value) }));
  };

  const handleFiles = async (e) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    // Reset so selecting the same file again still triggers onChange
    input.value = '';
    if (!files.length) return;

    const nonImages = files.filter((f) => !f.type || !f.type.startsWith('image/'));
    if (nonImages.length) {
      setError(`Only image files are allowed (${nonImages.map((f) => f.name).join(', ')})`);
      return;
    }
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooBig.length) {
      setError(`Each image must be 10MB or smaller (${tooBig.map((f) => f.name).join(', ')})`);
      return;
    }
    const remaining = MAX_IMAGES - uploadedPreviews.length;
    if (remaining <= 0) {
      setError(`You can upload at most ${MAX_IMAGES} images`);
      return;
    }
    if (files.length > remaining) {
      setError(`You can upload at most ${MAX_IMAGES} images (${remaining} more allowed)`);
      return;
    }

    try {
      setUploading(true);
      setError('');
      const bases = await Promise.all(files.map(downscaleImage));
      setUploadedPreviews((prev) => [...prev, ...bases].slice(0, MAX_IMAGES));
    } catch (err) {
      console.error('Image processing failed', err);
      setError(err?.message || 'Failed to read selected images');
    } finally {
      setUploading(false);
    }
  };

  const removePreview = (idx) => {
    setUploadedPreviews((prev) => prev.filter((_, i) => i !== idx));
  };



  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAllowed) {
      setError('Only owners or admins can create properties');
      return;
    }

    const price = Number(form.price);
    if (form.price === '' || !Number.isFinite(price) || price <= 0) {
      setError('Please enter a valid rent greater than 0');
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
    if (uploadedPreviews.length > MAX_IMAGES) {
      setError(`You can upload at most ${MAX_IMAGES} images`);
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const payload = {
        title: form.title,
        description: form.description,
        price,
        location: form.location,
        latitude,
        longitude,
        size: Number(form.size),
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        type: form.type,
        images: [...uploadedPreviews],
        availabilityStatus: form.availabilityStatus
      };

      const res = await createProperty(payload);
      const created = res?.data?.property;

      // Go to the newly created property page if we have the id; else go to dashboard
      if (created && created._id) {
        navigate(`/properties/${created._id}`);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Create property failed:', err);
      if (err?.status === 413 || /too large/i.test(err?.message || '')) {
        setError('Your images are too large to upload. Please remove some images or use smaller ones and try again.');
      } else {
        setError(err?.message || 'Failed to create property');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="max-w-3xl mx-auto pt-24 px-4">
        <p className="text-center text-neutral-600 dark:text-neutral-300">
          You do not have permission to create properties.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 py-10">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center mb-6">
          <Plus className="h-6 w-6 text-cyan-600 mr-2" />
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Add New Property for Rent</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-sm bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-neutral-800 p-6 rounded-lg shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Title</label>
              <input name="title" value={form.title} onChange={handleChange} required className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
            </div>
            <div>
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Rent (per month)</label>
              <input type="number" min="0" step="any" name="price" value={form.price} onChange={handleNumber} required className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={4} required className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
            </div>
            <div>
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Location</label>
              <input name="location" value={form.location} onChange={handleChange} required placeholder="e.g., Dhaka, Bangladesh" className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
            </div>
            {/* Property Location segment removed as requested */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Latitude</label>
                <input type="number" step="any" min={-90} max={90} name="latitude" value={form.latitude} onChange={handleChange} placeholder="e.g., 23.8103" className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
              </div>
              <div>
                <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Longitude</label>
                <input type="number" step="any" min={-180} max={180} name="longitude" value={form.longitude} onChange={handleChange} placeholder="e.g., 90.4125" className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Size (sqft)</label>
              <input type="number" min="0" name="size" value={form.size} onChange={handleNumber} required className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
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
            <div>
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Bedrooms</label>
              <input type="number" min={0} name="bedrooms" value={form.bedrooms} onChange={handleNumber} className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
            </div>
            <div>
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Bathrooms</label>
              <input type="number" min={0} name="bathrooms" value={form.bathrooms} onChange={handleNumber} className="w-full p-2 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-600" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-neutral-800 dark:text-neutral-200 mb-1">Upload Images <span className="text-neutral-500 dark:text-neutral-400">({uploadedPreviews.length}/{MAX_IMAGES})</span></label>
              <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading || uploadedPreviews.length >= MAX_IMAGES} className="block w-full text-sm text-neutral-700 dark:text-neutral-200 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 dark:file:bg-neutral-700 dark:file:text-neutral-100 transition file:transition file:duration-200 hover:file:bg-cyan-100 dark:hover:file:bg-neutral-600" />
              {uploadedPreviews.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {uploadedPreviews.map((src, idx) => (
                    <div key={idx} className="relative group">
                      <img src={src} alt={`upload-${idx}`} className="h-28 w-full object-cover rounded-sm" />
                      <button type="button" onClick={() => removePreview(idx)} className="absolute top-1 right-1 bg-black/60 text-white text-xs px-2 py-1 rounded-sm opacity-0 group-hover:opacity-100 transition">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 rounded-sm border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200">
              Cancel
            </button>
            <button type="submit" disabled={submitting || uploading} className="px-4 py-2 rounded-sm bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-60">
              {submitting ? 'Creating...' : uploading ? 'Processing images...' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProperty;
