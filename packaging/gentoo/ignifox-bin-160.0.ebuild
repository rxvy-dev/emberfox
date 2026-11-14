# Gentoo / Funtoo — www-client/ignifox-bin
EAPI=8
inherit desktop xdg

MY_PV="${PV}-2"
DESCRIPTION="Telemetry-free, deeply customizable browser built on Firefox"
HOMEPAGE="https://github.com/rxvy-dev/ignifox"
SRC_URI="
	amd64? ( ${HOMEPAGE}/releases/download/v${MY_PV}/ignifox-${MY_PV}-linux-x86_64.tar.xz )
	arm64? ( ${HOMEPAGE}/releases/download/v${MY_PV}/ignifox-${MY_PV}-linux-aarch64.tar.xz )"
S="${WORKDIR}/ignifox"
LICENSE="MPL-2.0"
SLOT="0"
KEYWORDS="~amd64 ~arm64"
RESTRICT="strip mirror"
QA_PREBUILT="opt/ignifox/*"
RDEPEND="x11-libs/gtk+:3 dev-libs/dbus-glib media-libs/alsa-lib x11-libs/libXtst dev-libs/nss"

src_install() {
	dodir /opt/ignifox
	cp -a . "${ED}/opt/ignifox/" || die
	rm -f "${ED}/opt/ignifox/install.sh" || die
	dosym ../../opt/ignifox/ignifox /usr/bin/ignifox
	sed 's|^Exec=ignifox|Exec=/usr/bin/ignifox|' ignifox.desktop > "${T}/ignifox.desktop" || die
	domenu "${T}/ignifox.desktop"
	local s
	for s in 16 22 24 32 48 64 128 256 512; do
		newicon -s ${s} icons/hicolor/${s}x${s}/apps/ignifox.png ignifox.png
	done
}
