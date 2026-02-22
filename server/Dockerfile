FROM python:3.11-slim

# FFmpeg + ffprobe for rendering, fontconfig + wget for font installation
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg fontconfig wget && \
    rm -rf /var/lib/apt/lists/*

# Download Google Fonts TTFs so FFmpeg subtitle rendering can use them
# Note: many Google Fonts are now variable fonts (.ttf with axis brackets in filename)
RUN mkdir -p /usr/local/share/fonts/google && \
    cd /usr/local/share/fonts/google && \
    BASE=https://github.com/google/fonts/raw/main && \
    wget -q "$BASE/ofl/bebasneue/BebasNeue-Regular.ttf"                  && \
    wget -q "$BASE/ofl/anton/Anton-Regular.ttf"                           && \
    wget -q "$BASE/ofl/bangers/Bangers-Regular.ttf"                       && \
    wget -q "$BASE/ofl/blackhansans/BlackHanSans-Regular.ttf"             && \
    wget -q "$BASE/ofl/russoone/RussoOne-Regular.ttf"                     && \
    wget -q -O Oswald.ttf "$BASE/ofl/oswald/Oswald%5Bwght%5D.ttf"        && \
    wget -q "$BASE/ofl/barlowcondensed/BarlowCondensed-Regular.ttf"      && \
    wget -q "$BASE/ofl/barlowcondensed/BarlowCondensed-Bold.ttf"         && \
    wget -q -O Montserrat.ttf "$BASE/ofl/montserrat/Montserrat%5Bwght%5D.ttf" && \
    wget -q "$BASE/ofl/poppins/Poppins-Regular.ttf"                       && \
    wget -q "$BASE/ofl/poppins/Poppins-Bold.ttf"                          && \
    wget -q -O Raleway.ttf "$BASE/ofl/raleway/Raleway%5Bwght%5D.ttf"     && \
    wget -q -O Nunito.ttf "$BASE/ofl/nunito/Nunito%5Bwght%5D.ttf"        && \
    wget -q -O DancingScript.ttf "$BASE/ofl/dancingscript/DancingScript%5Bwght%5D.ttf" && \
    wget -q "$BASE/ofl/pacifico/Pacifico-Regular.ttf"                     && \
    wget -q "$BASE/ofl/lobster/Lobster-Regular.ttf"                       && \
    wget -q "$BASE/apache/permanentmarker/PermanentMarker-Regular.ttf"    && \
    wget -q "$BASE/ofl/boogaloo/Boogaloo-Regular.ttf"                     && \
    wget -q -O Fredoka.ttf "$BASE/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf" && \
    wget -q "$BASE/ofl/righteous/Righteous-Regular.ttf"                   && \
    fc-cache -f

WORKDIR /app

# Install app dependencies + faster-whisper (CTranslate2-based, no PyTorch needed)
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir \
    -r server/requirements.txt \
    faster-whisper

# Copy source
COPY server/ server/

# Uploads land here; override with UPLOADS_DIR env var if needed
RUN mkdir -p /data/uploads

EXPOSE 8000

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
