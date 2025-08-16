const express = require('express');
const router = express.Router();
const jobQueue = require('../services/jobQueue');
const databaseService = require('../services/database');
const logger = require('../utils/logger');

// API endpoint untuk mengambil data jobs dengan filter dan statistik
router.get('/api/jobs', async (req, res) => {
  try {
    const { status, type, limit } = req.query;
    
    // Filter untuk query jobs
    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (limit) filters.limit = parseInt(limit);
    
    // Ambil data jobs
    const jobs = await jobQueue.getJobs(filters);
    
    // Hitung statistik
    const allJobs = await jobQueue.getJobs({});
    const stats = {
      total: allJobs.length,
      pending: allJobs.filter(job => job.status === 'pending').length,
      processing: allJobs.filter(job => job.status === 'processing').length,
      completed: allJobs.filter(job => job.status === 'completed').length,
      failed: allJobs.filter(job => job.status === 'failed').length,
      byType: {
        setup_laravel: allJobs.filter(job => job.type === 'setup_laravel').length,
        setup_laravel_step: allJobs.filter(job => job.type === 'setup_laravel_step').length,
        git_pull: allJobs.filter(job => job.type === 'git_pull').length
      }
    };
    
    // Parse data JSON untuk jobs
    const processedJobs = jobs.map(job => {
      let parsedData = {};
      try {
        parsedData = JSON.parse(job.data || '{}');
      } catch (e) {
        parsedData = { error: 'Invalid JSON data' };
      }
      
      let parsedResult = {};
      try {
        parsedResult = job.result ? JSON.parse(job.result) : null;
      } catch (e) {
        parsedResult = { error: 'Invalid JSON result' };
      }
      
      return {
        ...job,
        data: parsedData,
        result: parsedResult,
        duration: job.completed_at && job.created_at ? 
          new Date(job.completed_at) - new Date(job.created_at) : null
      };
    });
    
    logger.info('Jobs data retrieved successfully', { 
      count: jobs.length, 
      filters,
      stats 
    });
    
    res.json({
      success: true,
      data: processedJobs,
      stats,
      filters: filters,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to get jobs data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve jobs data',
      error: error.message
    });
  }
});

// API endpoint untuk mengambil detail job tertentu
router.get('/api/jobs/:id', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const job = await jobQueue.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    // Parse data JSON
    let parsedData = {};
    try {
      parsedData = JSON.parse(job.data || '{}');
    } catch (e) {
      parsedData = { error: 'Invalid JSON data' };
    }
    
    let parsedResult = {};
    try {
      parsedResult = job.result ? JSON.parse(job.result) : null;
    } catch (e) {
      parsedResult = { error: 'Invalid JSON result' };
    }
    
    const processedJob = {
      ...job,
      data: parsedData,
      result: parsedResult,
      duration: job.completed_at && job.created_at ? 
        new Date(job.completed_at) - new Date(job.created_at) : null
    };
    
    logger.info(`Job #${jobId} details retrieved`);
    
    res.json({
      success: true,
      data: processedJob,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Failed to get job #${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve job details',
      error: error.message
    });
  }
});

// Halaman web untuk monitoring jobs queue
router.get('/monitor', async (req, res) => {
  try {
    // Ambil data jobs terbaru (limit 50)
    const jobs = await jobQueue.getJobs({ limit: 50 });
    
    // Hitung statistik
    const allJobs = await jobQueue.getJobs({});
    const stats = {
      total: allJobs.length,
      pending: allJobs.filter(job => job.status === 'pending').length,
      processing: allJobs.filter(job => job.status === 'processing').length,
      completed: allJobs.filter(job => job.status === 'completed').length,
      failed: allJobs.filter(job => job.status === 'failed').length,
      byType: {
        setup_laravel: allJobs.filter(job => job.type === 'setup_laravel').length,
        setup_laravel_step: allJobs.filter(job => job.type === 'setup_laravel_step').length,
        git_pull: allJobs.filter(job => job.type === 'git_pull').length
      }
    };
    
    // Process jobs data untuk tampilan
    const processedJobs = jobs.map(job => {
      let parsedData = {};
      try {
        parsedData = JSON.parse(job.data || '{}');
      } catch (e) {
        parsedData = { error: 'Invalid JSON data' };
      }
      
      return {
        ...job,
        data: parsedData,
        duration: job.completed_at && job.created_at ? 
          new Date(job.completed_at) - new Date(job.created_at) : null,
        created_at_formatted: new Date(job.created_at).toLocaleString('id-ID'),
        updated_at_formatted: job.updated_at ? new Date(job.updated_at).toLocaleString('id-ID') : null,
        completed_at_formatted: job.completed_at ? new Date(job.completed_at).toLocaleString('id-ID') : null
      };
    });
    
    logger.info('Jobs monitor page accessed successfully');
    
    res.render('jobs-monitor', {
      jobsData: processedJobs,
      stats: stats,
      title: 'Jobs Queue Monitor - CloudPanel API'
    });
    
  } catch (error) {
    logger.error('Failed to load jobs monitor page:', error);
    res.status(500).render('error', {
      message: 'Failed to load jobs monitor page',
      error: error.message,
      title: 'Error - CloudPanel API'
    });
  }
});

// API endpoint untuk membatalkan job
router.post('/api/jobs/:id/cancel', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID'
      });
    }
    
    // Ambil data job untuk validasi
    const job = await jobQueue.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    // Hanya job dengan status 'processing' yang bisa dibatalkan
    if (job.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel job with status '${job.status}'. Only processing jobs can be cancelled.`
      });
    }
    
    // Update status job menjadi 'failed' dengan pesan pembatalan
    await jobQueue.updateJobStatus(jobId, 'failed', null, 'Job cancelled by user');
    
    logger.info(`Job #${jobId} cancelled by user`);
    
    res.json({
      success: true,
      message: 'Job successfully cancelled',
      jobId: jobId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Failed to cancel job #${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel job',
      error: error.message
    });
  }
});

module.exports = router;