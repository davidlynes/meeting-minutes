# ggml-compat.cmake - CPU compatibility toolchain for distributable builds
#
# Disables GGML_NATIVE (which compiles for the build machine's CPU only)
# and sets safe SIMD instruction levels for broad x86-64 compatibility.
#
# AVX (2011+) is enabled - supported by ~95% of x86-64 CPUs in use.
# AVX2/FMA/F16C (2013+ Haswell) are disabled to avoid crashes on older CPUs.
#
# Set via: CMAKE_TOOLCHAIN_FILE=<path>/ggml-compat.cmake

# Disable native CPU auto-detection (prevents -march=native / build-machine-specific flags)
set(GGML_NATIVE OFF CACHE BOOL "Disable native CPU optimization for portability" FORCE)

# Enable baseline SIMD (SSE3/SSSE3/SSE4.x are implied by x86-64)
set(GGML_AVX ON CACHE BOOL "Enable AVX (broadly supported)" FORCE)

# Disable advanced SIMD that many CPUs lack
set(GGML_AVX2 OFF CACHE BOOL "Disable AVX2 for compatibility" FORCE)
set(GGML_FMA OFF CACHE BOOL "Disable FMA for compatibility" FORCE)
set(GGML_F16C OFF CACHE BOOL "Disable F16C for compatibility" FORCE)

# Definitely disable AVX-512 (rare outside server CPUs)
set(GGML_AVX512 OFF CACHE BOOL "Disable AVX-512" FORCE)
set(GGML_AVX512_VBMI OFF CACHE BOOL "Disable AVX-512 VBMI" FORCE)
set(GGML_AVX512_VNNI OFF CACHE BOOL "Disable AVX-512 VNNI" FORCE)
set(GGML_AVX512_BF16 OFF CACHE BOOL "Disable AVX-512 BF16" FORCE)
set(GGML_AVX_VNNI OFF CACHE BOOL "Disable AVX-VNNI" FORCE)
