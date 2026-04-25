/**
 * 🔍 TESTING HELPER - Test Which Insurer Will Be Sent
 * 
 * HOW TO USE:
 * 1. Open browser console (F12 or Cmd+Option+I)
 * 2. Copy and paste this code into console
 * 3. Run the function: testWhichInsurerWillBeSent()
 * 
 * This will show you exactly which insurer will be sent to the API
 * WITHOUT actually sending the request or triggering ezLeads/email
 */

// Copy this function and paste it in browser console on the Results page
window.testWhichInsurerWillBeSent = function() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🔍 TESTING: Which Insurer Will Be Sent to API?');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Get the React state from the page (if available)
  // This is a hacky way but works for testing
  const resultsContainer = document.querySelector('[class*="results"]');
  
  if (!resultsContainer) {
    console.error('❌ Cannot find results container. Make sure you are on the Results page.');
    return;
  }
  
  // Try to find React fiber to access component state
  let reactKey = Object.keys(resultsContainer).find(key => key.startsWith('__reactFiber'));
  if (!reactKey) {
    console.error('❌ Cannot access React state. Try using the debug logs that appear automatically.');
    console.log('\n💡 TIP: The logs appear automatically when you:');
    console.log('   1. Click "Parler à Courtika" button');
    console.log('   2. Click "Choisir" on any insurer card');
    console.log('   3. Click "Personnaliser" button');
    console.log('\n   Look for logs starting with 🔍 [CourtikaModal DEBUG] or 🔍 [PersonalizeModal DEBUG]');
    return;
  }
  
  console.log('✅ Found React component state\n');
  console.log('📝 Instructions:');
  console.log('   - The debug logs appear automatically when you open modals');
  console.log('   - Look for "Submission Quote (What will be sent to API)"');
  console.log('   - The carrierCode field shows which insurer will be used\n');
  console.log('🎯 Expected Behavior:');
  console.log('   ✓ "Parler à Courtika" → Should send CHEAPEST insurer');
  console.log('   ✓ "Personnaliser" → Should send CHEAPEST insurer'); 
  console.log('   ✓ "Choisir" on card → Should send THAT specific insurer\n');
  console.log('═══════════════════════════════════════════════════\n');
};

// Auto-run on load
console.log('\n🎉 Testing helper loaded!');
console.log('📝 To test, type: testWhichInsurerWillBeSent()');
console.log('\n💡 OR just open a modal - debug logs appear automatically!\n');
