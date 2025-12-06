/**
 * LMS Database Access for Consumer App (READ-ONLY)
 * 
 * Provides READ-ONLY access to LMS database from Consumer App.
 * Write operations are blocked to prevent accidental data modification.
 * 
 * Usage:
 * const lmsDB = require('../config/lmsCollections');
 * 
 * const users = await lmsDB.users.find({ active: true }).toArray();
 * const lead = await lmsDB.allLeads.findOne({ _id: leadId });
 * const count = await lmsDB.products.countDocuments({ active: true });
 * 
 * // Available: users, allLeads, leads, products, productCategories,
 * //            integrations, pipelines, stages, leadHistory
 */

const lmsConnection = require('./lmsDatabase');

/**
 * Wait for LMS connection to be ready
 */
const waitForConnection = () => {
  return new Promise((resolve) => {
    if (lmsConnection.readyState === 1) {
      resolve();
    } else {
      lmsConnection.once('connected', resolve);
      // Also resolve on open event
      lmsConnection.once('open', resolve);
    }
  });
};

/**
 * Create a read-only wrapper for a collection
 * Only allows: find, findOne, countDocuments, distinct, aggregate
 * Waits for connection before accessing collection
 */
const readOnlyCollection = (collectionName) => {
  // Get collection lazily to ensure connection is ready
  const getCollection = async () => {
    await waitForConnection();
    return lmsConnection.collection(collectionName);
  };
  
  return {
    find: async (...args) => {
      const collection = await getCollection();
      return collection.find(...args);
    },
    findOne: async (...args) => {
      const collection = await getCollection();
      return collection.findOne(...args);
    },
    countDocuments: async (...args) => {
      const collection = await getCollection();
      return collection.countDocuments(...args);
    },
    distinct: async (...args) => {
      const collection = await getCollection();
      return collection.distinct(...args);
    },
    aggregate: async (...args) => {
      const collection = await getCollection();
      return collection.aggregate(...args);
    },
  };
};

module.exports = {
  // Database connection (for advanced use)
  connection: lmsConnection,
  
  // Read-only collections
  users: readOnlyCollection('users'),
  allLeads: readOnlyCollection('all_leads'),
  leads: readOnlyCollection('leads'),
  leadProducts: readOnlyCollection('lead_products'),
  advisors: readOnlyCollection('advisors'),
  products: readOnlyCollection('products'),
  productCategories: readOnlyCollection('productcategories'),
  integrations: readOnlyCollection('integrations'),
  pipelines: readOnlyCollection('pipelines'),
  stages: readOnlyCollection('stages'),
  leadHistory: readOnlyCollection('lead_history'),
  roundRobinSession: readOnlyCollection('round_robin_session'),
  quoteRecords: readOnlyCollection('quote_records'),
  
  // Get any collection by name (read-only)
  getCollection: (name) => readOnlyCollection(name),
};
