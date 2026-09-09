# ML Environment Assessment (Stage 0)

Inspection date: 2026-09-07
Host: Adnan's Windows PC (`D:\MuleGraph`), also the intended future local GPU training host.

This is an **observation-only** record. Nothing was installed, upgraded, or configured
to produce it. It exists so Jatin (ML lead) can decide framework versions for Stage 2/3
without re-discovering this hardware from scratch.

## Operating system

- Microsoft Windows 11 Home Single Language, version 10.0.26200, 64-bit.
- Shell used for inspection: PowerShell 5.1 and Git Bash, both available.

## Python

- `python` and `py` both resolve to **Python 3.14.6**.
- Executable: `C:\Python314\python.exe` (also visible via a WindowsApps shim and `py.exe` launcher).
- This is a **global** interpreter — there is no project-local virtual environment
  (`venv`, `.venv`, `poetry`, `conda`) anywhere in the repository as of this inspection.
  A project-local environment should be created before Stage 2/3 install work so
  training dependencies don't pollute (or get confused with) this global interpreter.

## RAM

- Total physical memory: **15.34 GB** (via `Win32_ComputerSystem.TotalPhysicalMemory`).

## GPU

Two GPUs are present (`Win32_VideoController`):

| Name | Reported adapter RAM | Driver version | Driver date |
| --- | --- | --- | --- |
| NVIDIA GeForce GTX 1650 | ~4.0 GB (4,293,918,720 bytes) dedicated | 32.0.16.1088 | 2026-07-22 |
| AMD Radeon(TM) Graphics | ~0.5 GB (536,870,912 bytes) — integrated/shared | 31.0.12044.3 | 2022-10-25 |

The GTX 1650 is the only GPU relevant to CUDA-based training; the AMD adapter is an
integrated GPU with shared system memory, not a training target.

`nvidia-smi` **is available** and runs successfully:

```
NVIDIA-SMI 610.88    KMD Version: 610.88    CUDA UMD Version: 13.3
GPU 0: NVIDIA GeForce GTX 1650, WDDM, 4096 MiB total, 0 MiB used, 0% util
```

**Important caveat (do not skip this when choosing framework versions):** `nvidia-smi`
reporting "CUDA UMD Version: 13.3" describes the *driver's* maximum supported CUDA
version. It does **not** mean a matching CUDA toolkit is installed, and it does **not**
mean any installed ML framework can actually use the GPU. That must be checked at the
framework level (see below) — and it currently fails.

## Existing Python packages (global interpreter)

The global interpreter already has a substantial set of packages installed —
apparently from unrelated prior work on this machine, not from anything set up for
MuleGraph. Notably:

- `torch` **2.14.0+cpu** — a CPU-only build. `torch.cuda.is_available()` returns
  **`False`**. So despite the GPU and driver being present, there is currently **no
  working GPU-accelerated PyTorch on this machine**. Installing a CUDA-enabled torch
  build (and verifying it separately) is required before any GPU training is planned.
- `fastapi` 0.141.1, `uvicorn` 0.52.4, `pydantic` 2.13.5, `starlette` 1.6.0 — already
  present, relevant to backend/Stage 1+ work but out of ML scope here.
- `numpy` 2.5.2, `pandas` 3.0.5, `scikit-learn` 1.9.0, `scipy` 1.18.1 — general data
  science stack.
- `transformers` 5.16.1, `sentence-transformers` 6.0.1, `accelerate` 1.14.0,
  `datasets` 2.21.0, `openai` 3.7.0 — NLP/LLM tooling, likely from other projects.
- **Not installed:** `xgboost`, `torch_geometric` (PyTorch Geometric), any CUDA-enabled
  torch build.

Full `pip list` output was captured during inspection and is not reproduced here in
full; re-run `python -m pip list` to refresh.

## What is confirmed vs. unknown

Confirmed:
- CPU-only PyTorch imports and runs.
- GPU is visible to the driver and `nvidia-smi`.
- No project-local virtual environment exists yet.
- `xgboost` and PyTorch Geometric are not installed anywhere on this machine.

Unknown / must be verified before Stage 2/3 dependency choices are made:
- Which CUDA toolkit version (if any) is actually installed system-wide, versus only
  the driver's reported maximum supported version.
- Whether a CUDA-enabled `torch` wheel compatible with this driver and a 4 GB VRAM
  budget installs and passes a real device check (e.g. `torch.cuda.is_available()`
  returning `True` and a small tensor op running on `cuda:0`).
- Current official compatibility matrices for `torch`, `torch_geometric`, and `xgboost`
  GPU builds at install time (these change over time; check at Stage 2/3 start, not
  from this document).
- Whether 4 GB VRAM is sufficient for the eventual GraphSAGE training batch size —
  unknown until the model and graph size are defined in Stage 3.

## Explicit non-actions in Stage 0

Per scope, none of the following were done, and should not be inferred from this
document as having been done:
- No GPU driver, CUDA toolkit, or Python upgrade/install.
- No `pip install` of `xgboost`, `torch_geometric`, or any CUDA-enabled `torch` build.
- No training datasets downloaded.
- No project-local virtual environment created (left for whoever starts Stage 2, so
  the environment matches the dependency set actually needed then).
