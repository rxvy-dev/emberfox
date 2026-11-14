# Gentoo / Funtoo — www-client/emberfox-bin
EAPI=8
inherit desktop xdg

MY_PV="${PV}-1"
DESCRIPTION="Telemetry-free, deeply customizable browser built on Firefox"
HOMEPAGE="https://github.com/rxvy-dev/emberfox"
SRC_URI="
	amd64? ( ${HOMEPAGE}/releases/download/v${MY_PV}/emberfox-${MY_PV}-linux-x86_64.tar.xz )
	arm64? ( ${HOMEPAGE}/releases/download/v${MY_PV}/emberfox-${MY_PV}-linux-aarch64.tar.xz )"
S="${WORKDIR}/emberfox"
LICENSE="MPL-2.0"
SLOT="0"
KEYWORDS="~amd64 ~arm64"
RESTRICT="strip mirror"
QA_PREBUILT="opt/emberfox/*"
RDEPEND="x11-libs/gtk+:3 dev-libs/dbus-glib media-libs/alsa-lib x11-libs/libXtst dev-libs/nss"

src_install() {
	dodir /opt/emberfox
	cp -a . "${ED}/opt/emberfox/" || die
	rm -f "${ED}/opt/emberfox/install.sh" || die
	dosym ../../opt/emberfox/emberfox /usr/bin/emberfox
	sed 's|^Exec=emberfox|Exec=/usr/bin/emberfox|' emberfox.desktop > "${T}/emberfox.desktop" || die
	domenu "${T}/emberfox.desktop"
	local s
	for s in 16 22 24 32 48 64 128 256 512; do
		newicon -s ${s} icons/hicolor/${s}x${s}/apps/emberfox.png emberfox.png
	done
}
