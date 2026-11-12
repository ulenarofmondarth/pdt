# Sphinx toolchain for building the PDT documentation.
# All Python tooling lives in this image; nothing is installed on the host.
FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928

RUN apt-get update \
    && apt-get install --yes --no-install-recommends make \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --root-user-action=ignore -r /tmp/requirements.txt

# The container runs as the calling user (see compose.yaml), who has no home directory.
ENV HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /docs

CMD ["make", "html"]
