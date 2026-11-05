<script setup>
// Unknown-route page: no product request or database lookup belongs here.
// Verify an unknown URL renders this view without a failing product API call.
</script>
<template>
  <section aria-labelledby="not-found-heading">
    <h2 id="not-found-heading" class="le-page-title le-title-dot">Page not found</h2>
    <p class="text-body-secondary">
      There is no page at this address. The link may be mistyped, or the page may have moved.
    </p>
    <RouterLink :to="{ name: 'dashboard' }" class="btn btn-primary">Back to Dashboard</RouterLink>
  </section>
</template>
